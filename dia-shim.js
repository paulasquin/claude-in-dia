// Makes the Claude extension's tab group work in Dia. anthropics/claude-code#107630.
const tabs = chrome.tabs;
const origGroup = tabs.group.bind(tabs);
const origUngroup = tabs.ungroup.bind(tabs);
const origCreate = tabs.create.bind(tabs);
const origGet = tabs.get.bind(tabs);
const origQuery = tabs.query.bind(tabs);

function withCallback(p, callback) {
  if (typeof callback === 'function') { p.then(callback, () => callback()); return; }
  return p;
}

function patch(name, fn) {
  Object.defineProperty(tabs, name, { value: fn, configurable: true, writable: true });
}

// Dia groups the tab but reports tab.groupId as -1, and query({groupId}) finds nothing, so the
// extension thinks its tab left the group. Remember what was grouped and fill it back in.
const groupOf = new Map();
const loaded = chrome.storage.session.get('diaGroups')
  .then(r => { for (const [tab, group] of r.diaGroups ?? []) groupOf.set(tab, group); })
  .catch(() => {});
const save = () => chrome.storage.session.set({ diaGroups: [...groupOf] }).catch(() => {});
tabs.onRemoved.addListener(id => { if (groupOf.delete(id)) save(); });

function fill(tab) {
  if (tab && tab.groupId === -1 && groupOf.has(tab.id)) tab.groupId = groupOf.get(tab.id);
  return tab;
}

async function waitLoaded(tabId, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const tab = await origGet(tabId).catch(() => null);
    if (!tab || (!tab.discarded && tab.status && tab.status !== 'unloaded')) return;
    await new Promise(r => setTimeout(r, 100));
  }
}

// Dia does not load background tabs and its chrome.tabs.group rejects unloaded ones ("Tab not
// found for session ID"). On failure, activate the tabs, wait for them to load, group them, then
// give focus back.
async function groupForDia(options) {
  const ids = [].concat(options?.tabIds ?? []);
  let groupId;
  try {
    groupId = await origGroup(options);
  } catch (err) {
    if (!ids.length) throw err;
    console.warn('[dia-shim] chrome.tabs.group failed, activating and retrying:', err?.message);
    const previous = new Map();
    try {
      for (const id of ids) {
        const tab = await origGet(id);
        if (!previous.has(tab.windowId)) {
          const [active] = await origQuery({ active: true, windowId: tab.windowId });
          previous.set(tab.windowId, active?.id);
        }
        await tabs.update(id, { active: true });
        await waitLoaded(id);
      }
      groupId = await origGroup(options);
    } finally {
      for (const prev of previous.values()) {
        if (prev !== undefined && !ids.includes(prev)) await tabs.update(prev, { active: true }).catch(() => {});
      }
    }
  }
  await loaded;
  for (const id of ids) groupOf.set(id, groupId);
  save();
  return groupId;
}

patch('group', (options, callback) => withCallback(groupForDia(options), callback));

patch('ungroup', (tabIds, callback) => {
  const p = (async () => {
    for (const id of [].concat(tabIds)) groupOf.delete(id);
    save();
    return origUngroup(tabIds);
  })();
  return withCallback(p, callback);
});

patch('get', (tabId, callback) => withCallback(loaded.then(() => origGet(tabId)).then(fill), callback));

patch('query', (info, callback) => {
  const p = (async () => {
    await loaded;
    if (info?.groupId === undefined || info.groupId === -1) return (await origQuery(info)).map(fill);
    const { groupId, ...rest } = info;
    const found = await origQuery(info);
    if (found.length) return found;
    const ids = [...groupOf].filter(([, g]) => g === groupId).map(([t]) => t);
    const all = await origQuery(rest);
    return all.filter(t => ids.includes(t.id)).map(fill);
  })();
  return withCallback(p, callback);
});

// Dia swaps a chrome://newtab tab for its native New Tab, which has no tab id, so the tab leaves
// Claude's group at once. Open those on about:blank instead, in the foreground.
patch('create', (props, callback) => {
  const url = !props?.url || props.url.startsWith('chrome://newtab') ? 'about:blank' : props.url;
  return withCallback(origCreate({ ...props, url, active: true }), callback);
});

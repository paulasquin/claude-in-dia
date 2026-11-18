# Claude in Dia

Makes the [Claude in Chrome](https://claude.com/chrome) extension usable for browser automation (Claude Code's `--chrome` tools) in the [Dia](https://www.diabrowser.com/) browser on macOS.

Unofficial workaround for [anthropics/claude-code#107630](https://github.com/anthropics/claude-code/issues/107630). It is not affiliated with Anthropic or The Browser Company. Once the extension handles Dia itself, go back to the Web Store version.

## The problem

In Dia, `tabs_context_mcp` with `createIfEmpty: true` fails with `Tab not found for session ID: TabSessionID(...)`, or the "Claude" tab group appears but every following call says the group no longer exists. Three Dia behaviours combine:

1. Dia does not load background tabs, and `chrome.tabs.group` rejects an unloaded tab.
2. Dia replaces a `chrome://newtab/` tab with its native New Tab, which has no tab id, so the tab leaves the group at once.
3. Dia reports `tab.groupId` as `-1` for grouped tabs, and `chrome.tabs.query({groupId})` finds nothing, so the extension thinks its tab left the group.

## The fix

`dia-shim.js` is imported before the extension's service worker and wraps four `chrome.tabs` calls:

- `create`: opens `chrome://newtab/` tabs on `about:blank` instead, in the foreground.
- `group`: on failure, activates the tabs, waits for them to load, retries, then restores the previously active tab. It also remembers which tab went into which group (in `chrome.storage.session`).
- `get` and `query`: fill in the remembered `groupId` when Dia reports `-1`, and answer `query({groupId})` from that memory when Dia finds nothing.

The extension's own code is not modified and is not in this repository: `build.sh` copies it from your Dia installation.

Side effect: each tab Claude opens briefly takes focus.

Tested with Dia 1.57.1 and Claude extension 1.0.107 on macOS: group creation, navigation, page text, screenshots and several tabs in the group.

## Install

1. Install Claude from the Chrome Web Store in Dia, if not done already, and connect it to Claude Code as usual.
2. Clone this repository and run `./build.sh`. It copies the newest installed Claude extension into `extension/`, adds `dia-shim.js` and imports it first.
3. In Dia, open `dia://extensions`, turn on Developer mode, disable the Web Store Claude extension (do not remove it: `build.sh` reads it) and click "Load unpacked" on the `extension/` folder. The copy keeps the extension id through the manifest `key`, so Claude Code's native messaging host still accepts it.
4. Repeat step 3 in each Dia profile you want to use.

Here Dia connected to Claude Code without further setup. If Claude Code does not see Dia at all, the issue suggests copying its native messaging host manifest into Dia's folder:

```sh
mkdir -p ~/Library/Application\ Support/Dia/User\ Data/NativeMessagingHosts
cp ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json \
   ~/Library/Application\ Support/Dia/User\ Data/NativeMessagingHosts/
```

## Updating

The unpacked copy does not update itself. When the Web Store extension updates, run `./build.sh` again and click reload on the unpacked Claude extension in `dia://extensions`.

## License

`dia-shim.js`, `build.sh` and this README are under the MIT license. The Claude extension itself belongs to Anthropic and is not distributed here.

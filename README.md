
# aw-watcher-workspace

Activity Watcher module to track the active workspace, each window activity will have the workspace context.

## Compatibility:
- Tested on Ubuntu/Debian GNOME

## Install

1. Clone
```sh
git clone https://github.com/nya1/aw-watcher-workspace.git`
```
2. Install modules
```sh
yarn install
```
3. Start the watcher
```sh
yarn run start
```

## Data sent to Activity Watch

Fields sent to AW:

- `title` Focused window title
- `app` Focused app name
- `workspace` Active workspace name

## How to set the workspace names

There are two ways

- GNOME Tweaks application
  - `Extensions` -> `Workspace indicator`
- Terminal
  - `gsettings set org.gnome.desktop.wm.preferences workspace-names "['games', 'university', 'work-acmecorp']"`


## Supported env variables

- `AW_WATCHER_WORKSPACE_IGNORE`
  - type: stringified array
  - default: '[]'
  - description: completly ignore the workspace names provided, no data will be sent
- `AW_WATCHER_WORKSPACE_REDACT`
  - type: stringified array
  - default: '[]'
  - description: redact the window title (field `title`) of the workspace names provided, the keyword `excluded` will be used instead of the original value
- `AW_WATCHER_WORKSPACE_CLIENT_NAME`
  - type: string
  - default: 'aw-watcher-workspace'
  - description: override the default client name, (hostname will be always appended)
- `AW_WATCHER_WORKSPACE_TESTING`
  - type: boolean
  - default: (not set)
  - description: enable the client testing mode

## Dependencies

### Node modules

- official `aw-client` npm module to send the data to AW server

### External / shell

- `xdotool` to get the focused window
- `xprop` to get the list of workspace names, focused window information 
- `gdbus` as a fallback to `xdotool` to get the focused app (e.g. `xdotool` fails when the gnome terminal is focused)

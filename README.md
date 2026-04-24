# ⚠️⚠️⚠️ THIS PLUGIN IS NOT MINE ! PLEASE REFER TO THE ORIGINAL AUTHORS [Davri](https://github.com/Davr1) AND [nin0-dev](https://github.com/nin0-dev) ! ⚠️⚠️⚠️

# ❤️ THE ORIGINAL REPOSITORY CAN BE FOUND HERE : https://git.nin0.dev/userplugins/favouriteAnything ❤️

## Bookmarks
- [Features](#features)
- [Installation (Desktop)](#installation-desktop-version)
- [Installation (Web)](#installation-web-version)
- [Screenshots](#screenshots)
- [Support](#support)
- [Credits](#credits)
- [Star History](#star-history)
- [License](#license)

# Features
This repository is an enhanced version of the original "Favourite Anything" plugin, with several additions :
- Separated Image/Video tabs w/ logic to sort favorites in the correct tab based on their format
- Proper format detection (especially for files) upon share
- Compatibility with "[GifPaste](https://github.com/Vendicated/Vencord/tree/main/src/plugins/gifPaste)" plugin (A bit clanky but works)

## Installation (Desktop Version)
**Prerequiries** : [git](https://git-scm.com/downloads) / [NodeJS](https://nodejs.org/en/download) / [pnpm](https://pnpm.io/installation)
- Open a CMD window, you will need a clone of Vencord's Repository, command : `git clone https://github.com/Vendicated/Vencord`
- Navigate to the path where you cloned the repository and be sure to enter the 'Vencord' folder (Ex : "`cd C:\Documents\Vencord`") then type : `pnpm install --frozen-lockfile`
- Now inside the 'Vencord' Folder, navigate to "`cd .\src\`" and type : "`md userplugins`"
- Navigate to "`cd .\userplugins\`", and clone nin0FavoriteAnything within : `git clone https://github.com/TetraSsky/nin0FavoriteAnything/`
- Then build : `pnpm build`
- And lastly inject : `pnpm inject` (Select your Discord path (Stable / Canary))

You're now ready to use nin0FavoriteAnything (be sure to enable it in Vencord's plugin settings) !

## Installation (Web Version)
**⚠️ Be sure to have completed all of the steps above ⚠️**

*You can however exclude both last commands : `pnpm build` & `pnpm inject`, since they're not needed for the web version*

*PS : If you have previously installed the official Vencord extension, you might want to disable/uninstall it to avoid conflicts*

- You will need to build as a web browser extension with : `pnpm buildWeb`
- This will generate a new folder in the main Vencord folder, path : 'Vencord\dist'
- Head on your web browser and open "chrome://extensions" (This can vary depending on your browser)
- Enable "Developer Mode" (*if available/needed*)
- Click on "Load Unpacked" and select the "dist/chromium-unpacked" folder for chromium based browsers or "dist/firefox-unpacked" for Firefox

You're now ready to use nin0FavoriteAnything, on your browser (same, be sure to enable it in Vencord's plugin settings) !

## Screenshots
<table>
  <tr>
    <td width="50%"><img src="https://github.com/user-attachments/assets/41541edd-61e3-491a-9975-254a3db2d2f6" alt="Context menu" style="width:100%"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://github.com/user-attachments/assets/6d502f44-d106-42a0-9b77-c4b493fb78b5" alt="Empty Image Tab" style="width:100%"></td>
    <td width="50%"><img src="https://github.com/user-attachments/assets/962d07f3-a402-4c93-af34-60064a8f70d8" alt="Empty Video Tab" style="width:100%"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://github.com/user-attachments/assets/bf565d78-feb7-4dd8-85f2-78409609779d" alt="Image Tab" style="width:100%"></td>
    <td width="50%"><img src="https://github.com/user-attachments/assets/36e9d5cf-af1f-4099-ba6d-5d5ee2106e08" alt="Video Tab" style="width:100%"></td>
  </tr>
</table>

## Support
If you encounter any issues or have feature requests (This will entirely depend of my free time. Be aware.):
[Open an issue](https://github.com/yourusername/nin0FavoriteAnything/issues)

## Credits
This plugin is built for and requires [Vencord](https://github.com/Vendicated/Vencord), a Discord client mod! Big thanks to them ❤️❤️❤️!

## Star History
[![Star History Chart](https://api.star-history.com/svg?repos=TetraSsky/nin0FavoriteAnything&type=Date)](https://www.star-history.com/#TetraSsky/nin0FavoriteAnything&Date)

## License
MIT License - See [LICENSE](LICENSE) for details.

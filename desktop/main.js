'use strict';
// The Labyrinth — Electron shell.
// The game itself is the untouched web bundle in www/ (built from
// ../labyrinth.html by scripts/build-www.js). This file only makes a window.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// LAB_SMOKE=1: boot, probe the game booted correctly, print a verdict, exit.
// Used by automated verification — keep it cheap and side-effect free.
const SMOKE = process.env.LAB_SMOKE === '1';

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 1080,           // room for the full 21-row square viewport
    minWidth: 720,
    minHeight: 620,
    show: !SMOKE,
    autoHideMenuBar: true,
    backgroundColor: '#0a0806',
    title: 'The Labyrinth',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);

  // F11 fullscreen toggle (no menu = no default accelerator)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });

  win.loadFile(path.join(__dirname, 'www', 'index.html'));

  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      try {
        const probe = await win.webContents.executeJavaScript(
          `({phase: typeof phase!=="undefined"?phase:null,
             boot: typeof initGame==="function" && typeof update==="function",
             profiles: typeof profiles!=="undefined" ? profiles.length : -1})`);
        const ok = probe.boot && probe.phase === 'MENU';
        console.log('SMOKE ' + (ok ? 'OK' : 'FAIL') + ' ' + JSON.stringify(probe));
        app.exit(ok ? 0 : 1);
      } catch (err) {
        console.error('SMOKE FAIL', err);
        app.exit(1);
      }
    });
    win.webContents.on('render-process-gone', (_e, d) => {
      console.error('SMOKE FAIL renderer gone:', d.reason);
      app.exit(1);
    });
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

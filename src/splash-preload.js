'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('splash', {
  onFadeout: (cb) => ipcRenderer.on('splash:fadeout', () => cb()),
  done:      ()   => ipcRenderer.send('splash:done'),
});

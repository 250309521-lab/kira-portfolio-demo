/**
 * Kira Takip Pro — Preload Script
 *
 * Exposes a secure, minimal API surface from main process to renderer.
 * Uses contextBridge — renderer cannot access Node.js directly.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {

  // ── App info ──────────────────────────────────────────────────────────────
  getInfo:    ()        => ipcRenderer.invoke('app:info'),
  getStatus:  ()        => ipcRenderer.invoke('app:status'),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSetting:    (key)       => ipcRenderer.invoke('settings:get', key),
  setSetting:    (key, val)  => ipcRenderer.invoke('settings:set', key, val),
  getAllSettings: ()          => ipcRenderer.invoke('settings:getAll'),

  // ── Backup ────────────────────────────────────────────────────────────────
  createBackup:  (trigger)   => ipcRenderer.invoke('backup:create', trigger),
  listBackups:   ()          => ipcRenderer.invoke('backup:list'),
  restoreBackup: (filePath)  => ipcRenderer.invoke('backup:restore', filePath),

  // ── Data export / import ──────────────────────────────────────────────────
  exportJSON:  (dataStr)  => ipcRenderer.invoke('data:exportJSON', dataStr),
  importJSON:  ()         => ipcRenderer.invoke('data:importJSON'),

  // ── File system ───────────────────────────────────────────────────────────
  openFolder:        (p)  => ipcRenderer.invoke('fs:openFolder', p),
  openBackupFolder:  ()   => ipcRenderer.invoke('fs:openBackupFolder'),

  // ── Audit log ─────────────────────────────────────────────────────────────
  addAudit:   (entry)     => ipcRenderer.invoke('audit:add', entry),
  getAudit:   (limit)     => ipcRenderer.invoke('audit:list', limit),

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers:   ()          => ipcRenderer.invoke('users:getAll'),
  upsertUser: (user)      => ipcRenderer.invoke('users:upsert', user),
  deleteUser: (id)        => ipcRenderer.invoke('users:delete', id),

  // ── Utilities ─────────────────────────────────────────────────────────────
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  isElectron: true,
  platform:   process.platform,
});

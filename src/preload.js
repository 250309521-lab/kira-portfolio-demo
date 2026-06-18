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

  // ── License / Machine Identity ─────────────────────────────────────────────
  getMachineId:   () => ipcRenderer.invoke('license:getMachineId'),
  checkLicense:   () => ipcRenderer.invoke('license:check'),
  importLicense:  () => ipcRenderer.invoke('license:import'),

  // ── Local Backup (LOCAL-BACKUP-1) ─────────────────────────────────────────
  createFullBackup:  (payload) => ipcRenderer.invoke('backup:createFull', payload),
  restoreFullBackup: (payload) => ipcRenderer.invoke('backup:restoreFull', payload),

  // ── UI chrome ─────────────────────────────────────────────────────────────
  setTitleBarColor: (opts) => ipcRenderer.send('titlebar:setColor', opts),

  // ── Cloud Auth (CLOUD-FOUNDATION-1B.2c) ──────────────────────────────────
  cloudGetStatus:      ()        => ipcRenderer.invoke('cloud:getStatus'),
  cloudLogin:          (payload) => ipcRenderer.invoke('cloud:login', payload),
  cloudSignup:         (payload) => ipcRenderer.invoke('cloud:signup', payload),
  cloudLogout:         ()        => ipcRenderer.invoke('cloud:logout'),
  cloudRestoreSession: ()        => ipcRenderer.invoke('cloud:restoreSession'),
});

// ── Cloud Workspace (CLOUD-FOUNDATION-1E.4) ───────────────────────────────────
contextBridge.exposeInMainWorld('cloudWorkspace', {
  listWorkspaces:     ()        => ipcRenderer.invoke('cloud:listWorkspaces'),
  createWorkspace:    (payload) => ipcRenderer.invoke('cloud:createWorkspace', payload),
  activateWorkspace:  (payload) => ipcRenderer.invoke('cloud:activateWorkspace', payload),
  getWorkspaceStatus: ()        => ipcRenderer.invoke('cloud:getWorkspaceStatus'),

  // ── Sync status (read-only) (CLOUD-FOUNDATION-1F.3) ───────────────────────
  getSyncStatus:             (payload) => ipcRenderer.invoke('cloud:getSyncStatus', payload),
  getLatestSnapshotMetadata: (payload) => ipcRenderer.invoke('cloud:getLatestSnapshotMetadata', payload),
});

// ── Cloud Backup readiness/preflight/upload/list/download (CLOUD-FOUNDATION-1F.4A-D) ──
contextBridge.exposeInMainWorld('cloudBackup', {
  getCloudBackupReadiness:          (payload) => ipcRenderer.invoke('cloud:getCloudBackupReadiness', payload),
  buildCloudBackupPreflight:        (payload) => ipcRenderer.invoke('cloud:buildCloudBackupPreflight', payload),
  createManualBackup:               (payload) => ipcRenderer.invoke('cloud:createManualBackup', payload),
  listBackups:                      (payload) => ipcRenderer.invoke('cloud:listBackups', payload),
  createBackupDownloadPreflight:    (payload) => ipcRenderer.invoke('cloud:createBackupDownloadPreflight', payload),
  downloadBackupToFile:             (payload) => ipcRenderer.invoke('cloud:downloadBackupToFile', payload),
});

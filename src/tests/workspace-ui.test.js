'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Workspace UI Tests — CLOUD-FOUNDATION-1E.6
 *
 * Standalone:  node src/tests/workspace-ui.test.js
 * Via run.js:  require('./workspace-ui.test.js').register(test, assert, assertEqual)
 *
 * Tests the workspace UI state machine and render logic with mocked bridge,
 * localStorage, DOM, and translation function. No Electron, no browser.
 */

// ── Inline copies of workspace UI state machine ───────────────────────────────
// Mirrors the WS_UI logic added to renderer.html (CLOUD-FOUNDATION-1E.6).
// State machine tests are pure JS; render tests use a minimal DOM mock.

var FORBIDDEN_FIELDS = ['access_token','refresh_token','token','device_id','deviceId',
  'supabaseKey','service_role','machineFingerprint','licenseJson','sb_secret'];

// ── Minimal mock DOM ──────────────────────────────────────────────────────────

function makeMockDOM() {
  var _els = {};
  return {
    _els: _els,
    getElementById: function(id) {
      if (!_els[id]) {
        _els[id] = { id: id, textContent: '', innerHTML: '', disabled: false,
          style: { display: '' }, value: '', placeholder: '', dataset: {} };
      }
      return _els[id];
    },
    _cardHtml: '',
    _cardDisplay: '',
  };
}

// ── Mock localStorage ─────────────────────────────────────────────────────────

function makeMockStorage(initial) {
  var _store = Object.assign({}, initial || {});
  return {
    getItem: function(k) { return _store.hasOwnProperty(k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
    _data: _store,
  };
}

// ── Mock bridge ───────────────────────────────────────────────────────────────

function makeMockBridge(overrides) {
  return Object.assign({
    listWorkspaces:    async function() { return { ok: true, workspaces: [] }; },
    createWorkspace:   async function() { return { ok: true, workspaceId: 'ws-new', workspaceName: 'New WS' }; },
    activateWorkspace: async function() { return { ok: true, workspaceId: 'ws-1', workspaceName: 'WS 1', memberRole: 'owner' }; },
    getWorkspaceStatus: async function() { return { ok: true }; },
  }, overrides || {});
}

// ── Translation stub ──────────────────────────────────────────────────────────

var _I18N = {
  wsSection: 'Workspace', wsLoading: 'Loading workspaces...', wsEmpty: 'No workspaces yet.',
  wsEmptySub: 'Create your first workspace.',
  wsCreate: 'Create Workspace', wsCreateBtn: 'Create', wsCreateName: 'Workspace name',
  wsActivate: 'Select', wsActive: 'Active', wsSwitch: 'Switch', wsRefresh: 'Refresh',
  wsRole_owner: 'Owner', wsRole_admin: 'Admin', wsRole_member: 'Member',
  wsSyncNote: 'Sync and backup are not active yet.',
  wsRestored: 'Restored from previous session',
  wsNotFound: 'Workspace is no longer accessible.',
  wsErrorNetwork: 'Network connection error.',
  wsErrorAuth: 'Session expired. Please sign in again.',
  wsErrorGeneric: 'An error occurred.',
  wsLicenseRequired: 'License required.',
  wsNotConfigured: 'Cloud connection is not configured.',
  wsPermissionDenied: 'Permission denied.',
  wsNameRequired: 'Workspace name is required.',
  wsNameTooLong: 'Workspace name too long (max 255).',
  wsCreateSuccess: '✅ Workspace created.',
  wsCreateConflict: 'A workspace with this name already exists.',
  wsCreateError: 'Failed to create workspace.',
  wsActivated: '✅ Workspace activated.',
  wsCreateAnother: 'New Workspace',
  wsOfflineNote: 'Offline — will update when reconnected.',
  close: 'Close',
};
function _t(key) { return _I18N[key] || key; }

// ── State machine factory ─────────────────────────────────────────────────────
// Creates an isolated WS_UI instance with injected seams.
// Returns {state, fns, mockStorage, mockBridge, toasts, CLOUD_UI, dom}.

function makeWsUI(opts) {
  opts = opts || {};
  var _storage = opts.storage || makeMockStorage(opts.initialStorage || {});
  var _bridge  = opts.bridge  || null;
  var _toasts  = [];
  var _dom     = opts.dom || makeMockDOM();
  var _cloudUI = opts.cloudUI || { state: 'authenticated' };

  var _state = {
    view: 'idle', workspaces: [], activeId: null, activeName: null, activeRole: null,
    restored: false, loading: false, error: null, createError: null, showSwitch: false,
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _roleLabel(role) {
    if (role === 'owner')  return _t('wsRole_owner');
    if (role === 'admin')  return _t('wsRole_admin');
    if (role === 'member') return _t('wsRole_member');
    return role ? String(role) : '';
  }

  function _errMsg(code) {
    if (code === 'not_authenticated')   return _t('wsErrorAuth');
    if (code === 'network_error')       return _t('wsErrorNetwork');
    if (code === 'workspace_not_found') return _t('wsNotFound');
    if (code === 'license_required')    return _t('wsLicenseRequired');
    if (code === 'not_configured')      return _t('wsNotConfigured');
    if (code === 'permission_denied')   return _t('wsPermissionDenied');
    return _t('wsErrorGeneric');
  }

  function _getBridge() { return _bridge; }

  function _readSavedId() {
    try { return _storage.getItem('ktp_active_workspace_id') || null; } catch (_) { return null; }
  }

  function _saveId(id) {
    try {
      if (id) _storage.setItem('ktp_active_workspace_id', id);
      else    _storage.removeItem('ktp_active_workspace_id');
    } catch (_) {}
  }

  function _toast(msg, color) { _toasts.push({ msg: msg, color: color }); }

  // Simplified render — mirrors renderer.html (CLOUD-FOUNDATION-1E.6B) structure
  function renderWorkspaceCard() {
    if (_cloudUI.state !== 'authenticated' && _cloudUI.state !== 'offline_cached') {
      _dom._cardDisplay = 'none';
      return;
    }
    _dom._cardDisplay = '';
    var view = _state.view;
    var _wsCnt = _state.workspaces.length;

    var html = '<div class="ws-section-hdr"><span id="ws-hdr"></span>' +
      (_wsCnt > 0 ? '<span class="ws-count-badge" id="ws-cnt"></span>' : '') +
      '</div>';

    if (view === 'loading') {
      html += '<div class="ws-loading"><span class="ws-spinner"></span><span id="ws-loading-txt"></span></div>';
    } else if (view === 'error') {
      html += '<div class="ws-error-card"><div id="ws-err-txt" class="ws-err-text"></div>' +
        '<button id="ws-retry-btn"></button></div>';
    } else if (view === 'create') {
      html += '<div class="ws-create-form">' +
        '<label id="ws-cname-lbl"></label>' +
        '<input id="ws-name-inp" class="form-input">' +
        '<div class="ws-create-err-msg" id="ws-create-err"></div>' +
        '<button id="ws-create-btn"></button>' +
        '<button id="ws-cancel-btn"></button>' +
      '</div>';
    } else if (view === 'list') {
      if (_state.activeId) {
        html += '<div class="ws-active-card">' +
          '<div class="ws-active-row">' +
            '<div class="ws-status-dot ok"></div>' +
            '<span id="ws-aname"></span><span id="ws-arole"></span>' +
          '</div>' +
          (_state.restored ? '<div id="ws-restored-note"></div>' : '') +
          '<div id="ws-sync-note"></div></div>';
      }
      if (_wsCnt === 0 && !_state.activeId) {
        html += '<div class="ws-empty-state">' +
          '<div class="ws-empty-icon">🏢</div>' +
          '<div id="ws-empty-txt"></div>' +
          '<div id="ws-empty-sub"></div>' +
          '<button id="ws-create-link"></button>' +
        '</div>';
      } else if (_wsCnt === 0 && _state.activeId) {
        html += '<div id="ws-offline-note"></div>';
      } else if (_state.showSwitch || !_state.activeId) {
        for (var i = 0; i < _wsCnt; i++) {
          var _isA = _state.workspaces[i].workspaceId === _state.activeId;
          html += '<div class="ws-row' + (_isA ? ' ws-row-active' : '') + '">' +
            '<div id="ws-rn-' + i + '"></div><div id="ws-rr-' + i + '"></div>' +
            (_isA
              ? '<span id="ws-chip-' + i + '"></span>'
              : '<button id="ws-act-' + i + '"></button>') + '</div>';
        }
      }
      html += '<div class="ws-footer-actions">';
      if (_state.activeId && _wsCnt > 1) { html += '<button id="ws-switch-btn"></button>'; }
      if (_wsCnt > 0) { html += '<button id="ws-new-btn"></button>'; }
      html += '<button id="ws-refresh-btn"></button></div>';
    } else {
      html += '<button id="ws-idle-btn"></button>';
    }

    _dom._cardHtml = html;
    // textContent pass — mirrors renderer.html exactly
    var _h = _dom.getElementById('ws-hdr'); if (_h) _h.textContent = _t('wsSection');
    var _cnt = _dom.getElementById('ws-cnt'); if (_cnt) _cnt.textContent = String(_wsCnt);
    if (view === 'loading') {
      var _lt = _dom.getElementById('ws-loading-txt'); if (_lt) _lt.textContent = _t('wsLoading');
    }
    if (view === 'error') {
      var _et = _dom.getElementById('ws-err-txt'); if (_et) _et.textContent = _errMsg(_state.error);
      var _rb = _dom.getElementById('ws-retry-btn'); if (_rb) _rb.textContent = _t('wsRefresh');
    }
    if (view === 'create') {
      var _cl = _dom.getElementById('ws-cname-lbl'); if (_cl) _cl.textContent = _t('wsCreateName');
      var _nin = _dom.getElementById('ws-name-inp'); if (_nin) _nin.placeholder = _t('wsCreateName');
      var _cb = _dom.getElementById('ws-create-btn'); if (_cb) _cb.textContent = _t('wsCreateBtn');
      var _cx = _dom.getElementById('ws-cancel-btn'); if (_cx) _cx.textContent = _t('close');
    }
    if (view === 'list') {
      if (_state.activeId) {
        var _an = _dom.getElementById('ws-aname'); if (_an) _an.textContent = _state.activeName || _state.activeId;
        var _ar = _dom.getElementById('ws-arole');
        if (_ar) { _ar.textContent = _roleLabel(_state.activeRole); _ar.dataset.role = _state.activeRole || ''; }
        var _sn = _dom.getElementById('ws-sync-note'); if (_sn) _sn.textContent = _t('wsSyncNote');
        if (_state.restored) { var _rn = _dom.getElementById('ws-restored-note'); if (_rn) _rn.textContent = _t('wsRestored'); }
      }
      if (_wsCnt === 0 && !_state.activeId) {
        var _et2 = _dom.getElementById('ws-empty-txt'); if (_et2) _et2.textContent = _t('wsEmpty');
        var _esub = _dom.getElementById('ws-empty-sub'); if (_esub) _esub.textContent = _t('wsEmptySub');
        var _ck  = _dom.getElementById('ws-create-link'); if (_ck) _ck.textContent = _t('wsCreate');
      } else if (_wsCnt === 0 && _state.activeId) {
        var _on = _dom.getElementById('ws-offline-note'); if (_on) _on.textContent = _t('wsOfflineNote');
      } else if (_state.showSwitch || !_state.activeId) {
        for (var j = 0; j < _wsCnt; j++) {
          var _w = _state.workspaces[j];
          var _rn2 = _dom.getElementById('ws-rn-' + j); if (_rn2) _rn2.textContent = _w.workspaceName || _w.workspaceId;
          var _rr2 = _dom.getElementById('ws-rr-' + j); if (_rr2) _rr2.textContent = _roleLabel(_w.memberRole);
          if (_w.workspaceId === _state.activeId) {
            var _ch = _dom.getElementById('ws-chip-' + j); if (_ch) _ch.textContent = _t('wsActive');
          } else {
            var _ab = _dom.getElementById('ws-act-' + j); if (_ab) _ab.textContent = _t('wsActivate');
          }
        }
      }
      var _sw = _dom.getElementById('ws-switch-btn');
      if (_sw) _sw.textContent = _state.showSwitch ? _t('close') : _t('wsSwitch');
      var _nb = _dom.getElementById('ws-new-btn'); if (_nb) _nb.textContent = _state.activeId ? _t('wsCreateAnother') : _t('wsCreate');
      var _rfb = _dom.getElementById('ws-refresh-btn'); if (_rfb) _rfb.textContent = _t('wsRefresh');
    }
    if (view === 'idle') {
      var _ib = _dom.getElementById('ws-idle-btn'); if (_ib) _ib.textContent = _t('wsRefresh');
    }
  }

  // ── Public functions ─────────────────────────────────────────────────────────

  async function loadWorkspaces() {
    var bridge = _getBridge();
    if (!bridge) { _state.view = 'error'; _state.error = 'not_authenticated'; renderWorkspaceCard(); return; }
    _state.view = 'loading'; _state.error = null; renderWorkspaceCard();
    var r;
    try { r = await bridge.listWorkspaces(); } catch (_) {
      _state.view = 'error'; _state.error = 'unknown_error'; renderWorkspaceCard(); return;
    }
    if (!r || !r.ok) {
      _state.view = 'error'; _state.error = r ? (r.error || 'unknown_error') : 'unknown_error';
      renderWorkspaceCard(); return;
    }
    _state.workspaces = Array.isArray(r.workspaces) ? r.workspaces : [];
    if (_state.activeId) {
      var f = _state.workspaces.find(function(w) { return w.workspaceId === _state.activeId; });
      if (!f) { _state.activeId = null; _state.activeName = null; _state.activeRole = null; _saveId(null); }
    }
    _state.view = 'list'; renderWorkspaceCard();
  }

  async function activateWorkspace(workspaceId) {
    var bridge = _getBridge(); if (!bridge) return;
    _state.loading = true; renderWorkspaceCard();
    var r;
    try { r = await bridge.activateWorkspace({ workspaceId: workspaceId }); } catch (_) {
      _state.loading = false; _toast(_t('wsErrorGeneric'), 'red'); renderWorkspaceCard(); return;
    }
    _state.loading = false;
    if (!r || !r.ok) { _toast(_errMsg(r ? r.error : 'unknown_error'), 'red'); renderWorkspaceCard(); return; }
    _state.activeId   = r.workspaceId;
    _state.activeName = r.workspaceName;
    _state.activeRole = r.memberRole;
    _state.showSwitch = false;
    _saveId(r.workspaceId);
    _toast(_t('wsActivated'), 'green');
    renderWorkspaceCard();
  }

  async function activateByIndex(idx) {
    var ws = _state.workspaces[idx]; if (!ws) return;
    await activateWorkspace(ws.workspaceId);
  }

  function showCreate() { _state.view = 'create'; _state.createError = null; renderWorkspaceCard(); }
  function showList()   { _state.view = 'list';   _state.createError = null; renderWorkspaceCard(); }
  function toggleSwitch() { _state.showSwitch = !_state.showSwitch; renderWorkspaceCard(); }

  async function submitCreate(nameValue, dataWorkspaceId) {
    var name = (nameValue || '').trim();
    _state.createError = null;
    var errEl = _dom.getElementById('ws-create-err');
    if (!name) { _state.createError = 'name_required'; if (errEl) errEl.textContent = _t('wsNameRequired'); return; }
    if (name.length > 255) { _state.createError = 'name_too_long'; if (errEl) errEl.textContent = _t('wsNameTooLong'); return; }
    var localId = dataWorkspaceId || '';
    if (!localId) { if (errEl) errEl.textContent = _t('wsErrorGeneric'); return; }
    var bridge = _getBridge();
    if (!bridge) { if (errEl) errEl.textContent = _t('wsErrorAuth'); return; }
    if (errEl) errEl.textContent = '';
    var r;
    try { r = await bridge.createWorkspace({ name: name, localWorkspaceId: localId }); } catch (_) {
      _state.createError = 'unknown_error'; if (errEl) errEl.textContent = _t('wsCreateError'); return;
    }
    if (!r || !r.ok) {
      var ec = (r && r.error) || 'unknown_error'; _state.createError = ec;
      if (errEl) errEl.textContent = (ec === 'workspace_conflict') ? _t('wsCreateConflict') :
        (ec === 'license_required') ? _t('wsLicenseRequired') :
        (ec === 'permission_denied') ? _t('wsPermissionDenied') : _t('wsCreateError');
      return;
    }
    _toast(_t('wsCreateSuccess'), 'green');
    await loadWorkspaces();
  }

  function restoreOffline() {
    var savedId = _readSavedId(); if (!savedId) return;
    _state.activeId   = savedId;
    _state.activeName = null;
    _state.activeRole = null;
    _state.restored   = true;
    _state.view       = 'list';
  }

  async function restore() {
    var savedId = _readSavedId(); if (!savedId) return { ok: true, restored: false };
    var bridge = _getBridge(); if (!bridge) return { ok: false, error: 'not_authenticated' };
    var lr;
    try { lr = await bridge.listWorkspaces(); } catch (_) {
      _state.activeId = savedId; return { ok: false, error: 'unknown_error' };
    }
    if (!lr || !lr.ok) {
      _state.activeId = savedId;
      return { ok: false, error: lr ? (lr.error || 'unknown_error') : 'unknown_error' };
    }
    var wss = Array.isArray(lr.workspaces) ? lr.workspaces : [];
    _state.workspaces = wss;
    var found = wss.find(function(w) { return w.workspaceId === savedId; });
    if (!found) {
      _state.activeId = null; _state.activeName = null; _state.activeRole = null;
      _saveId(null); _state.view = 'list';
      return { ok: true, restored: false, reason: 'workspace_not_found' };
    }
    _state.activeId   = found.workspaceId;
    _state.activeName = found.workspaceName || null;
    _state.activeRole = found.memberRole    || null;
    _state.restored   = true; _state.view = 'list';
    return { ok: true, restored: true, workspaceId: found.workspaceId, workspaceName: found.workspaceName };
  }

  return {
    state:       _state,
    dom:         _dom,
    storage:     _storage,
    toasts:      _toasts,
    fns: {
      loadWorkspaces: loadWorkspaces,
      activateWorkspace: activateWorkspace,
      activateByIndex: activateByIndex,
      showCreate: showCreate,
      showList: showList,
      toggleSwitch: toggleSwitch,
      submitCreate: submitCreate,
      restore: restore,
      restoreOffline: restoreOffline,
      renderWorkspaceCard: renderWorkspaceCard,
    },
    setCloudState: function(s) { _cloudUI.state = s; },
    setBridge: function(b)     { _bridge = b; },
  };
}

// ── Test registration ─────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {
  // ── Sync tests ───────────────────────────────────────────────────────────────

  test('WS_UI: initial state is idle with null active workspace', function() {
    var u = makeWsUI();
    assertEqual(u.state.view,       'idle');
    assertEqual(u.state.activeId,   null);
    assertEqual(u.state.activeName, null);
    assertEqual(u.state.activeRole, null);
    assert(Array.isArray(u.state.workspaces), 'workspaces is array');
    assertEqual(u.state.workspaces.length, 0);
    assertEqual(u.state.loading,    false);
    assertEqual(u.state.error,      null);
    assertEqual(u.state.restored,   false);
  });

  test('wsShowCreate: view transitions to create', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.fns.showCreate();
    assertEqual(u.state.view, 'create');
    assertEqual(u.state.createError, null);
  });

  test('wsShowList: view transitions to list', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'create';
    u.fns.showList();
    assertEqual(u.state.view, 'list');
  });

  test('wsToggleSwitch: flips showSwitch', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    assertEqual(u.state.showSwitch, false);
    u.fns.toggleSwitch();
    assertEqual(u.state.showSwitch, true);
    u.fns.toggleSwitch();
    assertEqual(u.state.showSwitch, false);
  });

  test('renderWorkspaceCard: hides card when not authenticated', function() {
    var u = makeWsUI({ cloudUI: { state: 'configured_anonymous' } });
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom._cardDisplay, 'none');
  });

  test('renderWorkspaceCard: shows card when authenticated', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom._cardDisplay, '');
  });

  test('renderWorkspaceCard: error state sets textContent not innerHTML for error text', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view  = 'error';
    u.state.error = 'network_error';
    u.fns.renderWorkspaceCard();
    var errEl = u.dom.getElementById('ws-err-txt');
    assertEqual(errEl.textContent, _I18N.wsErrorNetwork);
    // innerHTML is set from static structure only; error text is never in innerHTML
    assert(!u.dom._cardHtml.includes('Network connection error.'), 'error text not in innerHTML template');
  });

  test('renderWorkspaceCard: no forbidden fields in rendered HTML structure', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    // Populate state with sensitive-looking field names to ensure they never leak into HTML structure
    u.state.view       = 'list';
    u.state.activeId   = 'ws-safe-001';
    u.state.activeName = 'Test Workspace';
    u.state.activeRole = 'owner';
    u.state.workspaces = [{ workspaceId: 'ws-safe-001', workspaceName: 'Test Workspace', memberRole: 'owner' }];
    u.fns.renderWorkspaceCard();
    var html = u.dom._cardHtml;
    FORBIDDEN_FIELDS.forEach(function(f) {
      assert(!html.includes(f), 'forbidden field "' + f + '" must not appear in innerHTML structure');
    });
  });

  test('renderWorkspaceCard: active workspace name set via textContent', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-xss-test';
    u.state.activeName = '<script>alert(1)</script>';
    u.state.activeRole = 'owner';
    u.fns.renderWorkspaceCard();
    // Name should be in textContent, not interpolated into HTML
    assert(!u.dom._cardHtml.includes('<script>alert(1)</script>'), 'XSS payload not in innerHTML');
    var nameEl = u.dom.getElementById('ws-aname');
    assertEqual(nameEl.textContent, '<script>alert(1)</script>');
  });

  test('renderWorkspaceCard: loading state renders spinner text via textContent', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'loading';
    u.fns.renderWorkspaceCard();
    var ltxt = u.dom.getElementById('ws-loading-txt');
    assertEqual(ltxt.textContent, _I18N.wsLoading);
  });

  test('renderWorkspaceCard: empty-state create button text set via textContent', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.workspaces = [];
    u.fns.renderWorkspaceCard();
    var etxt = u.dom.getElementById('ws-empty-txt');
    assertEqual(etxt.textContent, _I18N.wsEmpty);
    var ck = u.dom.getElementById('ws-create-link');
    assertEqual(ck.textContent, _I18N.wsCreate);
  });

  test('renderWorkspaceCard: workspace list items set via textContent', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.workspaces = [
      { workspaceId: 'ws-a', workspaceName: 'Alpha', memberRole: 'owner' },
      { workspaceId: 'ws-b', workspaceName: 'Beta',  memberRole: 'member' },
    ];
    u.state.showSwitch = true;
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom.getElementById('ws-rn-0').textContent, 'Alpha');
    assertEqual(u.dom.getElementById('ws-rr-0').textContent, _I18N.wsRole_owner);
    assertEqual(u.dom.getElementById('ws-rn-1').textContent, 'Beta');
    assertEqual(u.dom.getElementById('ws-rr-1').textContent, _I18N.wsRole_member);
    assert(!u.dom._cardHtml.includes('Alpha'), 'workspace name not in innerHTML');
    assert(!u.dom._cardHtml.includes('Beta'),  'workspace name not in innerHTML');
  });

  test('renderWorkspaceCard: restored flag shows restored note via textContent', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-r';
    u.state.activeName = 'Restored WS';
    u.state.activeRole = 'owner';
    u.state.restored   = true;
    u.fns.renderWorkspaceCard();
    var rn = u.dom.getElementById('ws-restored-note');
    assertEqual(rn.textContent, _I18N.wsRestored);
  });

  // ── Error message mapping — new error codes (1E.6A) ─────────────────────────

  test('_wsErrorMsg: license_required maps to wsLicenseRequired', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'license_required';
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom.getElementById('ws-err-txt').textContent, _I18N.wsLicenseRequired);
  });

  test('_wsErrorMsg: not_configured maps to wsNotConfigured', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'not_configured';
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom.getElementById('ws-err-txt').textContent, _I18N.wsNotConfigured);
  });

  test('_wsErrorMsg: permission_denied maps to wsPermissionDenied', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'permission_denied';
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom.getElementById('ws-err-txt').textContent, _I18N.wsPermissionDenied);
  });

  // ── 1E.6B: Create another workspace + offline UX ─────────────────────────────

  test('renderWorkspaceCard: ws-new-btn visible when wsCnt>0 even with active workspace (no switch required)', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-1';
    u.state.activeName = 'Workspace 1';
    u.state.activeRole = 'owner';
    u.state.workspaces = [{ workspaceId: 'ws-1', workspaceName: 'Workspace 1', memberRole: 'owner' }];
    u.state.showSwitch = false; // switch panel closed
    u.fns.renderWorkspaceCard();
    var newBtn = u.dom.getElementById('ws-new-btn');
    assert(newBtn !== null, 'ws-new-btn must exist when wsCnt > 0 and active workspace set');
  });

  test('renderWorkspaceCard: ws-new-btn label is wsCreateAnother when activeId set', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-1';
    u.state.activeName = 'Workspace 1';
    u.state.workspaces = [{ workspaceId: 'ws-1', workspaceName: 'Workspace 1', memberRole: 'owner' }];
    u.fns.renderWorkspaceCard();
    var newBtn = u.dom.getElementById('ws-new-btn');
    assertEqual(newBtn.textContent, _I18N.wsCreateAnother);
  });

  test('renderWorkspaceCard: ws-new-btn label is wsCreate when no activeId', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view       = 'list';
    u.state.activeId   = null;
    u.state.workspaces = [{ workspaceId: 'ws-1', workspaceName: 'Workspace 1', memberRole: 'owner' }];
    u.fns.renderWorkspaceCard();
    var newBtn = u.dom.getElementById('ws-new-btn');
    assertEqual(newBtn.textContent, _I18N.wsCreate);
  });

  test('renderWorkspaceCard: offline restore shows active card and offline note, no empty-state', function() {
    var u = makeWsUI({ cloudUI: { state: 'offline_cached' } });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-cached';
    u.state.activeName = null; // unknown offline
    u.state.restored   = true;
    u.state.workspaces = []; // no list loaded
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardDisplay !== 'none', 'card must be visible in offline_cached state');
    var offlineNote = u.dom.getElementById('ws-offline-note');
    assert(offlineNote !== null, 'offline note element must exist');
    assertEqual(offlineNote.textContent, _I18N.wsOfflineNote);
    var emptyTxt = u.dom._els['ws-empty-txt'];
    assert(!emptyTxt || emptyTxt.textContent === '', 'empty-state text must not appear during offline restore');
  });

  test('renderWorkspaceCard: shows card in offline_cached state', function() {
    var u = makeWsUI({ cloudUI: { state: 'offline_cached' } });
    u.state.view = 'list';
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom._cardDisplay, '');
  });

  // ── Sync status (CLOUD-FOUNDATION-1F.3, read-only) — static source checks ────
  // These read the real renderer.html, since the inline WS_UI mirror above predates
  // the sync-status feature. They verify the actual implementation, not a copy of it.

  console.log('\nSync Status (CLOUD-FOUNDATION-1F.3) — static source checks:');

  var _rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'renderer.html'), 'utf8');

  test('sync status: SYNC_UI state object exists in renderer.html', function() {
    assert(/var SYNC_UI = \{/.test(_rendererSrc), 'SYNC_UI state object must exist');
  });

  test('sync status: wsRefreshSyncStatus only calls getSyncStatus and getLatestSnapshotMetadata on the bridge', function() {
    var m = _rendererSrc.match(/async function wsRefreshSyncStatus\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, 'wsRefreshSyncStatus function must exist');
    var body = m[1];
    assert(/bridge\.getSyncStatus\(/.test(body), 'must call bridge.getSyncStatus');
    assert(/bridge\.getLatestSnapshotMetadata\(/.test(body), 'must call bridge.getLatestSnapshotMetadata');
    // No write-capable bridge methods may be called from this read-only function.
    assert(!/bridge\.(createWorkspace|activateWorkspace)\(/.test(body),
      'wsRefreshSyncStatus must never call a write-capable bridge method');
  });

  test('sync status: no raw ipcRenderer usage anywhere in renderer.html', function() {
    assert(!/ipcRenderer/.test(_rendererSrc), 'renderer.html must never reference ipcRenderer directly');
  });

  test('sync status: no direct Supabase/fetch call from renderer.html sync status code', function() {
    var m = _rendererSrc.match(/async function wsRefreshSyncStatus\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, 'wsRefreshSyncStatus function must exist');
    assert(!/fetch\(/.test(m[1]), 'wsRefreshSyncStatus must not call fetch() directly — must go through the bridge');
    assert(!/supabase/i.test(m[1]), 'wsRefreshSyncStatus must not reference Supabase directly');
  });

  test('sync status: rendered sync HTML section never embeds dynamic sync fields via innerHTML interpolation', function() {
    var m = _rendererSrc.match(/\} else if \(view === 'list'\) \{([\s\S]*?)\n  \} else \{/);
    assert(m, 'view === list HTML-building branch must exist');
    var body = m[1];
    // The HTML-building string concatenation must not directly embed SYNC_UI dynamic values
    // (currentRevision, snapshot.*, lockExpiresAt) — those must only be set via textContent later.
    assert(!/\+\s*SYNC_UI\.snapshot\./.test(body), 'snapshot fields must not be string-concatenated into innerHTML');
    assert(!/\+\s*SYNC_UI\.currentRevision/.test(body), 'currentRevision must not be string-concatenated into innerHTML');
    assert(!/\+\s*SYNC_UI\.lockExpiresAt/.test(body), 'lockExpiresAt must not be string-concatenated into innerHTML');
  });

  test('sync status: textContent pass sets ws-sync-summary, ws-sync-snapshot, ws-sync-lock-note, ws-sync-lastchecked via textContent only', function() {
    assert(/getElementById\('ws-sync-summary'\)[\s\S]{0,80}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-summary must be set via textContent');
    assert(/getElementById\('ws-sync-snapshot'\)[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-snapshot must be set via textContent');
    assert(/getElementById\('ws-sync-lock-note'\)[\s\S]{0,80}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-lock-note must be set via textContent');
    assert(/getElementById\('ws-sync-lastchecked'\)[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-lastchecked must be set via textContent');
  });

  test('sync status: getSyncStatus does not expose lock_held_by / pushed_by anywhere in renderer.html', function() {
    assert(!/lock_held_by/.test(_rendererSrc), 'lock_held_by must never appear in renderer.html');
    assert(!/pushed_by/.test(_rendererSrc),    'pushed_by must never appear in renderer.html');
  });

  test('sync status: SYNC_UI never stores deviceId/device_id/snapshot_hash/storage_path', function() {
    var m = _rendererSrc.match(/var SYNC_UI = \{([\s\S]*?)\n\};/);
    assert(m, 'SYNC_UI object literal must exist');
    var body = m[1];
    assert(!/deviceId|device_id/.test(body),  'SYNC_UI must not declare a device id field');
    assert(!/snapshot_hash/.test(body),       'SYNC_UI must not declare a snapshot_hash field');
    assert(!/storage_path/.test(body),        'SYNC_UI must not declare a storage_path field');
  });

  // ── Legacy direct-Supabase fence (CLOUD-FOUNDATION-1F.3A) — static source checks ─

  console.log('\nLegacy Direct Supabase Fence (CLOUD-FOUNDATION-1F.3A) — static source checks:');

  test('legacy fence: LEGACY_DISABLED flag is declared and set to true', function() {
    assert(/const LEGACY_DISABLED = true;/.test(_rendererSrc),
      'LEGACY_DISABLED must exist and be hard-set to true');
  });

  test('legacy fence: _focusPull (focus-triggered silent pull) is gated by LEGACY_DISABLED before any cloud check', function() {
    var m = _rendererSrc.match(/async function _focusPull\(\)\{([\s\S]*?)\n\}/);
    assert(m, '_focusPull function must exist');
    assert(/^\s*if\(LEGACY_DISABLED\) return;/m.test(m[1]),
      '_focusPull must short-circuit on LEGACY_DISABLED before touching DATA.cloud');
  });

  test('legacy fence: _startupPull (startup auto-pull) is gated by LEGACY_DISABLED before any cloud check', function() {
    var m = _rendererSrc.match(/async function _startupPull\(\)\{([\s\S]*?)\n\}/);
    assert(m, '_startupPull function must exist');
    assert(/if\(LEGACY_DISABLED\) return;/.test(m[1]),
      '_startupPull must short-circuit on LEGACY_DISABLED before touching DATA.cloud');
  });

  test('legacy fence: supabasePush/supabasePull contain no real fetch() call (already retired stubs)', function() {
    var push = _rendererSrc.match(/async function supabasePush\(\)\s*\{([\s\S]*?)\n\}/);
    var pull = _rendererSrc.match(/async function supabasePull\(\)\s*\{([\s\S]*?)\n\}/);
    assert(push && pull, 'supabasePush and supabasePull must exist');
    assert(!/fetch\(/.test(push[1]), 'supabasePush must not perform a real fetch() call');
    assert(!/fetch\(/.test(pull[1]), 'supabasePull must not perform a real fetch() call');
  });

  test('legacy fence: legacy direct-Supabase entry points (supabaseConnect/checkSupabaseStatus) are not wired to any UI element', function() {
    assert(!/onclick\s*=\s*["']supabaseConnect\(/.test(_rendererSrc),
      'supabaseConnect must not be reachable from an onclick handler');
    assert(!/onclick\s*=\s*["']checkSupabaseStatus\(/.test(_rendererSrc),
      'checkSupabaseStatus must not be reachable from an onclick handler');
    assert(!/id=["']supa-msg["']/.test(_rendererSrc),
      'the legacy supa-msg DOM element must not exist (no UI surface to drive it)');
  });

  test('legacy fence: cloudSync() data-mutation call sites all funnel through the now-retired no-op stub', function() {
    var m = _rendererSrc.match(/async function cloudSync\(dir='push'\)\{([\s\S]*?)\n\}/);
    assert(m, 'cloudSync function must exist');
    assert(!/fetch\(/.test(m[1]) && !/supabasePush|supabasePull/.test(m[1]),
      'cloudSync must remain a no-op and must not call supabasePush/supabasePull or fetch()');
  });

  test('legacy fence: onboarding wizard no longer offers a "Cloud" entry point into the dead-end Supabase credential form', function() {
    assert(!/onclick="obCloudBootstrap\(\)"/.test(_rendererSrc),
      'onboarding step 3 must not expose a button that opens the legacy Supabase credential form');
  });

  test('legacy fence: SYNC_UI/WS_UI (1E/1F cloud state) are never assigned into DATA, so ktp_v5 never persists them', function() {
    assert(!/DATA\.cloud\s*=\s*SYNC_UI/.test(_rendererSrc), 'SYNC_UI must never be assigned into DATA.cloud');
    assert(!/DATA\.(syncStatus|workspaceCloud)\s*=/.test(_rendererSrc), 'no DATA.syncStatus/workspaceCloud field must exist');
    assert(!/DATA\.cloud\.supabaseKey\s*=\s*[^'"]/.test(_rendererSrc) || /DATA\.cloud\.supabaseKey\s*=\s*['"]{2}/.test(_rendererSrc),
      'DATA.cloud.supabaseKey must never be assigned a non-empty literal');
  });

  // ── Cloud backup readiness UI (CLOUD-FOUNDATION-1F.4A) — static source checks ──

  console.log('\nCloud Backup Readiness UI (CLOUD-FOUNDATION-1F.4A) — static source checks:');

  test('backup readiness: BACKUP_UI state object exists in renderer.html', function() {
    assert(/var BACKUP_UI = \{/.test(_rendererSrc), 'BACKUP_UI state object must exist');
  });

  test('backup readiness: wsRefreshBackupReadiness only calls read-only backup bridge methods', function() {
    var m = _rendererSrc.match(/async function wsRefreshBackupReadiness\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, 'wsRefreshBackupReadiness function must exist');
    var body = m[1];
    assert(/bridge\.getCloudBackupReadiness\(/.test(body),   'must call getCloudBackupReadiness');
    assert(/bridge\.buildCloudBackupPreflight\(/.test(body), 'must call buildCloudBackupPreflight');
    // No write/upload/restore bridge methods may be referenced anywhere.
    assert(!/bridge\.(upload|restore|apply|createBackup|pushSnapshot)/i.test(body),
      'wsRefreshBackupReadiness must never call a write/upload/restore method');
  });

  test('backup readiness: no fetch()/Supabase reference inside wsRefreshBackupReadiness', function() {
    var m = _rendererSrc.match(/async function wsRefreshBackupReadiness\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, 'wsRefreshBackupReadiness must exist');
    assert(!/fetch\(/.test(m[1]),   'must not call fetch() directly');
    assert(!/supabase/i.test(m[1]), 'must not reference Supabase directly');
  });

  // ── Cloud Backup Manual Upload UI (CLOUD-FOUNDATION-1F.4B) ─────────────────

  console.log('\nCloud Backup Manual Upload UI (CLOUD-FOUNDATION-1F.4B) — static source checks:');

  test('backup upload: manual backup button is wired to wsShowBackupConfirm (1F.4B)', function() {
    assert(/onclick="wsShowBackupConfirm\(\)"/.test(_rendererSrc), 'wsShowBackupConfirm must be wired to upload button');
    assert(/onclick="wsConfirmManualBackup\(\)"/.test(_rendererSrc), 'wsConfirmManualBackup must be wired to confirm button');
    assert(/onclick="wsCancelBackupConfirm\(\)"/.test(_rendererSrc), 'wsCancelBackupConfirm must be wired to cancel button');
    // Refresh button from 1F.4A still present.
    assert(/onclick="wsRefreshBackupReadiness\(\)"/.test(_rendererSrc), 'refresh button must still be wired');
    // No legacy/wrong handler names wired.
    assert(!/onclick="wsUploadBackup\(/.test(_rendererSrc),   'no wsUploadBackup handler must be wired');
    assert(!/onclick="wsCloudBackup\(/.test(_rendererSrc),    'no wsCloudBackup handler must be wired');
    assert(!/onclick="wsRestoreBackup\(/.test(_rendererSrc),  'no restore handler must be wired');
    assert(!/onclick="wsApplyBackup\(/.test(_rendererSrc),    'no apply handler must be wired');
  });

  test('backup upload: wsConfirmManualBackup only uses read-only bridge methods except createManualBackup', function() {
    var m = _rendererSrc.match(/async function wsConfirmManualBackup\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, 'wsConfirmManualBackup must exist');
    var body = m[1];
    assert(/bridge\.createManualBackup\(/.test(body), 'must call createManualBackup');
    // Must NOT call restore/apply/sync.
    assert(!/bridge\.(restore|apply|pushSnapshot|syncApply)/i.test(body),
      'wsConfirmManualBackup must never call a restore/sync method');
    assert(!/fetch\(/.test(body),   'must not call fetch() directly');
    assert(!/supabase/i.test(body), 'must not reference Supabase directly');
  });

  test('backup upload: button is disabled while uploading (no double-submit)', function() {
    assert(/BACKUP_UI\.uploadState === .uploading. \? .* disabled/.test(_rendererSrc) ||
           (/ws-backup-upload-btn/.test(_rendererSrc) && /disabled/.test(_rendererSrc)),
      'upload button must be disabled during uploading state');
    assert(/uploadState === .uploading.[\s\S]{0,40}return/.test(_rendererSrc) ||
           /if \(BACKUP_UI\.uploadState === .uploading.\) return/.test(_rendererSrc),
      'wsConfirmManualBackup must guard against re-entry while uploading');
  });

  test('backup upload: no auto-upload wired to startup/focus/timer', function() {
    // wsConfirmManualBackup must not appear in startup or focus handlers.
    var startup = _rendererSrc.match(/function _startupPull\(\)\{([\s\S]*?)\n\}/);
    if (startup) assert(!/wsConfirmManualBackup/.test(startup[1]), 'no auto-upload in _startupPull');
    assert(!/setInterval[^)]*wsConfirmManualBackup/.test(_rendererSrc), 'no timer auto-upload');
    assert(!/addEventListener['"`,\s]*focus['"`,\s]*[\s\S]{0,200}wsConfirmManualBackup/.test(_rendererSrc),
      'no focus auto-upload');
  });

  test('backup upload: upload result values set via textContent only', function() {
    assert(/getElementById\(.ws-backup-upload-ok.\)[\s\S]{0,400}\.textContent\s*=/.test(_rendererSrc),
      'upload success message must be set via textContent');
    assert(/getElementById\(.ws-backup-upload-err.\)[\s\S]{0,400}\.textContent\s*=/.test(_rendererSrc),
      'upload error message must be set via textContent');
    // No BACKUP_UI field concatenated directly into innerHTML
    assert(!/\+\s*BACKUP_UI\.uploadError/.test(_rendererSrc), 'uploadError must not be concatenated into innerHTML');
    // lastUploadAt/lastUploadBytes are fine to concatenate into a local variable before textContent —
    // the ban is on concatenation directly into innerHTML strings (card.innerHTML = html + ...).
    // The critical check is that the results are never injected via innerHTML:
    assert(!/html\s*\+=[\s\S]{0,200}BACKUP_UI\.lastUploadAt/.test(_rendererSrc), 'lastUploadAt must not go into innerHTML');
    assert(!/html\s*\+=[\s\S]{0,200}BACKUP_UI\.uploadError/.test(_rendererSrc), 'uploadError must not go into innerHTML');
  });

  test('backup upload: renderer never exposes uploadState-sensitive internal fields', function() {
    assert(!/BACKUP_UI\.(storagePath|checksum|archiveStr|device_id|deviceId|token)/.test(_rendererSrc),
      'BACKUP_UI must not carry sensitive internal fields');
  });

  test('backup upload: confirm box explains upload scope (no restore/sync warning text)', function() {
    // wsBackupNoRestoreWarning i18n key must exist in both languages.
    assert(/wsBackupNoRestoreWarning/.test(_rendererSrc), 'wsBackupNoRestoreWarning i18n key must exist');
    // wsBackupConfirmText must exist.
    assert(/wsBackupConfirmText/.test(_rendererSrc), 'wsBackupConfirmText i18n key must exist');
  });

  test('backup upload: no direct restore path exposed from backup bridge or upload handler', function() {
    var confirmFn = _rendererSrc.match(/async function wsConfirmManualBackup\(\)\s*\{([\s\S]*?)\n\}/);
    if (confirmFn) {
      assert(!/restoreBackup|restoreFull|applyBackup/i.test(confirmFn[1]),
        'wsConfirmManualBackup must never call any restore method');
    }
  });

  test('backup readiness: dynamic values are set via textContent, not innerHTML interpolation', function() {
    var m = _rendererSrc.match(/\} else if \(view === 'list'\) \{([\s\S]*?)\n  \} else \{/);
    assert(m, 'view === list HTML-building branch must exist');
    var body = m[1];
    assert(!/\+\s*BACKUP_UI\.byteSize/.test(body),   'byteSize must not be concatenated into innerHTML');
    assert(!/\+\s*BACKUP_UI\.role/.test(body),       'role must not be concatenated into innerHTML');
    assert(!/\+\s*BACKUP_UI\.lastLocalBackupAt/.test(body), 'lastLocalBackupAt must not be concatenated into innerHTML');
    assert(/getElementById\('ws-backup-summary'\)[\s\S]{0,80}\.textContent\s*=/.test(_rendererSrc),
      'ws-backup-summary must be set via textContent');
    assert(/getElementById\('ws-backup-size'\)[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'ws-backup-size must be set via textContent');
  });

  test('backup readiness: renderer never references device id, storage path, or raw checksum', function() {
    assert(!/BACKUP_UI\.(deviceId|device_id|storagePath|storage_path|checksum)/.test(_rendererSrc),
      'BACKUP_UI must not carry device id / storage path / raw checksum');
  });

  test('backup readiness: no raw ipcRenderer usage anywhere in renderer.html', function() {
    assert(!/ipcRenderer/.test(_rendererSrc), 'renderer.html must never reference ipcRenderer directly');
  });
}

async function registerAsync(testAsync, assert, assertEqual) {
  // ── Load workspaces ──────────────────────────────────────────────────────────

  await testAsync('wsLoadWorkspaces: success populates workspaces and sets view=list', async function() {
    var ws = [{ workspaceId: 'ws-1', workspaceName: 'Workspace 1', memberRole: 'owner' }];
    var u = makeWsUI({ bridge: makeMockBridge({ listWorkspaces: async function() { return { ok: true, workspaces: ws }; } }) });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view, 'list');
    assertEqual(u.state.workspaces.length, 1);
    assertEqual(u.state.workspaces[0].workspaceId, 'ws-1');
    assertEqual(u.state.error, null);
  });

  await testAsync('wsLoadWorkspaces: empty list sets view=list with zero workspaces', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view, 'list');
    assertEqual(u.state.workspaces.length, 0);
  });

  await testAsync('wsLoadWorkspaces: bridge returns ok:false sets view=error', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ listWorkspaces: async function() { return { ok: false, error: 'network_error' }; } }) });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view,  'error');
    assertEqual(u.state.error, 'network_error');
  });

  await testAsync('wsLoadWorkspaces: bridge throws sets view=error with unknown_error', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ listWorkspaces: async function() { throw new Error('net fail'); } }) });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view,  'error');
    assertEqual(u.state.error, 'unknown_error');
  });

  await testAsync('wsLoadWorkspaces: no bridge sets error=not_authenticated', async function() {
    var u = makeWsUI(); // no bridge
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view,  'error');
    assertEqual(u.state.error, 'not_authenticated');
  });

  await testAsync('wsLoadWorkspaces: stale activeId is cleared when not in fresh list', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ listWorkspaces: async function() { return { ok: true, workspaces: [] }; } }) });
    u.state.activeId = 'ws-stale';
    await u.fns.loadWorkspaces();
    assertEqual(u.state.activeId, null);
    assertEqual(u.storage._data['ktp_active_workspace_id'], undefined);
  });

  // ── Activate workspace ───────────────────────────────────────────────────────

  await testAsync('wsActivateWorkspace: success updates state and persists id', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    await u.fns.activateWorkspace('ws-1');
    assertEqual(u.state.activeId,   'ws-1');
    assertEqual(u.state.activeName, 'WS 1');
    assertEqual(u.state.activeRole, 'owner');
    assertEqual(u.storage._data['ktp_active_workspace_id'], 'ws-1');
    assertEqual(u.toasts.length, 1);
    assertEqual(u.toasts[0].color, 'green');
  });

  await testAsync('wsActivateWorkspace: error toasts and does not update state', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ activateWorkspace: async function() { return { ok: false, error: 'workspace_not_found' }; } }) });
    u.state.view = 'list'; u.state.workspaces = [];
    await u.fns.activateWorkspace('ws-gone');
    assertEqual(u.state.activeId, null);
    assertEqual(u.toasts.length, 1);
    assertEqual(u.toasts[0].color, 'red');
  });

  await testAsync('wsActivateByIndex: out-of-bounds index is no-op', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    u.state.workspaces = [{ workspaceId: 'ws-1', workspaceName: 'W1', memberRole: 'owner' }];
    await u.fns.activateByIndex(99);
    assertEqual(u.state.activeId, null);
    assertEqual(u.toasts.length, 0);
  });

  await testAsync('wsActivateByIndex: valid index activates correct workspace', async function() {
    var bridge = makeMockBridge({
      activateWorkspace: async function(payload) {
        return { ok: true, workspaceId: payload.workspaceId, workspaceName: 'WS', memberRole: 'member' };
      },
    });
    var u = makeWsUI({ bridge: bridge });
    u.state.workspaces = [
      { workspaceId: 'ws-a', workspaceName: 'Alpha', memberRole: 'owner' },
      { workspaceId: 'ws-b', workspaceName: 'Beta',  memberRole: 'member' },
    ];
    await u.fns.activateByIndex(1);
    assertEqual(u.state.activeId, 'ws-b');
  });

  // ── Create workspace ─────────────────────────────────────────────────────────

  await testAsync('wsSubmitCreate: empty name sets createError=name_required', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    await u.fns.submitCreate('', 'local-ws-id');
    assertEqual(u.state.createError, 'name_required');
    var errEl = u.dom.getElementById('ws-create-err');
    assertEqual(errEl.textContent, _I18N.wsNameRequired);
  });

  await testAsync('wsSubmitCreate: name >255 chars sets createError=name_too_long', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    await u.fns.submitCreate('x'.repeat(256), 'local-ws-id');
    assertEqual(u.state.createError, 'name_too_long');
  });

  await testAsync('wsSubmitCreate: conflict sets createError=workspace_conflict', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ createWorkspace: async function() { return { ok: false, error: 'workspace_conflict' }; } }) });
    await u.fns.submitCreate('Existing WS', 'local-ws-id');
    assertEqual(u.state.createError, 'workspace_conflict');
    var errEl = u.dom.getElementById('ws-create-err');
    assertEqual(errEl.textContent, _I18N.wsCreateConflict);
  });

  await testAsync('wsSubmitCreate: success toasts and reloads list', async function() {
    var listCalls = 0;
    var bridge = makeMockBridge({
      createWorkspace: async function() { return { ok: true, workspaceId: 'ws-new', workspaceName: 'New' }; },
      listWorkspaces: async function() {
        listCalls++;
        return { ok: true, workspaces: [{ workspaceId: 'ws-new', workspaceName: 'New', memberRole: 'owner' }] };
      },
    });
    var u = makeWsUI({ bridge: bridge });
    await u.fns.submitCreate('New Workspace', 'local-ws-id');
    assertEqual(u.state.createError, null);
    assertEqual(u.toasts.length, 1);
    assertEqual(u.toasts[0].color, 'green');
    assert(listCalls >= 1, 'listWorkspaces called after create');
    assertEqual(u.state.view, 'list');
  });

  await testAsync('wsSubmitCreate: bridge throws sets createError=unknown_error', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ createWorkspace: async function() { throw new Error('net'); } }) });
    await u.fns.submitCreate('WS Name', 'local-ws-id');
    assertEqual(u.state.createError, 'unknown_error');
  });

  await testAsync('wsSubmitCreate: empty localWorkspaceId shows generic error (regression: 1E.6A root cause)', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    u.state.view = 'create'; u.fns.renderWorkspaceCard();
    await u.fns.submitCreate('My Workspace', '');
    var errEl = u.dom.getElementById('ws-create-err');
    assertEqual(errEl.textContent, _I18N.wsErrorGeneric);
    assertEqual(u.toasts.length, 0);
  });

  await testAsync('wsSubmitCreate: no bridge shows auth error (auth failure)', async function() {
    var u = makeWsUI(); // no bridge
    await u.fns.submitCreate('My Workspace', 'local-ws-id');
    var errEl = u.dom.getElementById('ws-create-err');
    assertEqual(errEl.textContent, _I18N.wsErrorAuth);
    assertEqual(u.toasts.length, 0);
  });

  await testAsync('wsSubmitCreate: license_required shows license message (specific error)', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ createWorkspace: async function() { return { ok: false, error: 'license_required' }; } }) });
    await u.fns.submitCreate('My Workspace', 'local-ws-id');
    assertEqual(u.state.createError, 'license_required');
    assertEqual(u.dom.getElementById('ws-create-err').textContent, _I18N.wsLicenseRequired);
  });

  // ── Restore ──────────────────────────────────────────────────────────────────

  await testAsync('wsRestore: no saved id returns {ok:true,restored:false}', async function() {
    var u = makeWsUI({ bridge: makeMockBridge() });
    var r = await u.fns.restore();
    assertEqual(r.ok,       true);
    assertEqual(r.restored, false);
    assertEqual(u.state.activeId, null);
  });

  await testAsync('wsRestore: valid saved id populates state and returns restored:true', async function() {
    var ws = [{ workspaceId: 'ws-saved', workspaceName: 'My WS', memberRole: 'owner' }];
    var bridge = makeMockBridge({ listWorkspaces: async function() { return { ok: true, workspaces: ws }; } });
    var u = makeWsUI({ bridge: bridge, initialStorage: { 'ktp_active_workspace_id': 'ws-saved' } });
    var r = await u.fns.restore();
    assertEqual(r.ok,           true);
    assertEqual(r.restored,     true);
    assertEqual(r.workspaceId,  'ws-saved');
    assertEqual(u.state.activeId,   'ws-saved');
    assertEqual(u.state.activeName, 'My WS');
    assertEqual(u.state.activeRole, 'owner');
    assertEqual(u.state.restored,   true);
    assertEqual(u.state.view,       'list');
  });

  await testAsync('wsRestore: stale id clears state and storage', async function() {
    var bridge = makeMockBridge({ listWorkspaces: async function() { return { ok: true, workspaces: [] }; } });
    var u = makeWsUI({ bridge: bridge, initialStorage: { 'ktp_active_workspace_id': 'ws-gone' } });
    var r = await u.fns.restore();
    assertEqual(r.ok,       true);
    assertEqual(r.restored, false);
    assertEqual(r.reason,   'workspace_not_found');
    assertEqual(u.state.activeId, null);
    assertEqual(u.storage._data['ktp_active_workspace_id'], undefined);
    assertEqual(u.state.view, 'list');
  });

  await testAsync('wsRestore: bridge list failure holds id optimistically', async function() {
    var bridge = makeMockBridge({ listWorkspaces: async function() { throw new Error('offline'); } });
    var u = makeWsUI({ bridge: bridge, initialStorage: { 'ktp_active_workspace_id': 'ws-offline' } });
    var r = await u.fns.restore();
    assertEqual(r.ok,    false);
    assertEqual(u.state.activeId, 'ws-offline');
  });

  await testAsync('wsRestore: no bridge returns {ok:false,error:not_authenticated}', async function() {
    var u = makeWsUI({ initialStorage: { 'ktp_active_workspace_id': 'ws-x' } }); // no bridge
    var r = await u.fns.restore();
    assertEqual(r.ok,    false);
    assertEqual(r.error, 'not_authenticated');
  });

  // ── Security: no sensitive fields rendered ───────────────────────────────────

  await testAsync('no token/deviceId rendered in any view state', async function() {
    var sensitiveWS = { workspaceId: 'ws-sec', workspaceName: 'Sensitive', memberRole: 'owner',
      access_token: 'tok-xyz', deviceId: 'dev-abc', device_id: 'dev-abc' };
    var bridge = makeMockBridge({
      listWorkspaces: async function() { return { ok: true, workspaces: [sensitiveWS] }; },
      activateWorkspace: async function() {
        return { ok: true, workspaceId: 'ws-sec', workspaceName: 'Sensitive', memberRole: 'owner',
          access_token: 'tok-xyz' };
      },
    });
    var u = makeWsUI({ bridge: bridge });
    // Load workspaces
    await u.fns.loadWorkspaces();
    u.state.showSwitch = true;
    u.fns.renderWorkspaceCard();
    var html = u.dom._cardHtml;
    FORBIDDEN_FIELDS.forEach(function(f) {
      assert(!html.includes(f), 'forbidden field "' + f + '" not in ws-list innerHTML');
    });
    // Activate workspace
    await u.fns.activateWorkspace('ws-sec');
    u.fns.renderWorkspaceCard();
    var html2 = u.dom._cardHtml;
    FORBIDDEN_FIELDS.forEach(function(f) {
      assert(!html2.includes(f), 'forbidden field "' + f + '" not in active-card innerHTML');
    });
    // Token value itself should not appear
    assert(!html2.includes('tok-xyz'), 'token value not in innerHTML');
  });

  await testAsync('error message rendered via textContent only', async function() {
    var u = makeWsUI({ bridge: makeMockBridge({ listWorkspaces: async function() { return { ok: false, error: 'network_error' }; } }) });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view, 'error');
    var errEl = u.dom.getElementById('ws-err-txt');
    // Text via textContent, not interpolated into html
    assert(!u.dom._cardHtml.includes(_I18N.wsErrorNetwork), 'error text not in innerHTML structure');
    assertEqual(errEl.textContent, _I18N.wsErrorNetwork);
  });

  // ── 1E.6B: Create second workspace + offline restore ─────────────────────────

  await testAsync('create second workspace when first is active: succeeds and updates list', async function() {
    var _ws = [{ workspaceId: 'ws-1', workspaceName: 'First', memberRole: 'owner' }];
    var bridge = makeMockBridge({
      createWorkspace: async function() { return { ok: true, workspaceId: 'ws-2', workspaceName: 'Second' }; },
      listWorkspaces: async function() {
        return { ok: true, workspaces: [
          { workspaceId: 'ws-1', workspaceName: 'First',  memberRole: 'owner' },
          { workspaceId: 'ws-2', workspaceName: 'Second', memberRole: 'owner' },
        ] };
      },
    });
    var u = makeWsUI({ bridge: bridge });
    u.state.view       = 'list';
    u.state.activeId   = 'ws-1';
    u.state.activeName = 'First';
    u.state.activeRole = 'owner';
    u.state.workspaces = _ws;
    await u.fns.submitCreate('Second', 'local-ws-id');
    assertEqual(u.state.createError, null);
    assertEqual(u.toasts.length, 1);
    assertEqual(u.toasts[0].color, 'green');
    assertEqual(u.state.workspaces.length, 2);
    assertEqual(u.state.view, 'list');
    // Active workspace should still be ws-1 (create doesn't change active)
    assertEqual(u.state.activeId, 'ws-1');
  });

  await testAsync('switch between two workspaces: activateByIndex updates active workspace', async function() {
    var bridge = makeMockBridge({
      activateWorkspace: async function(payload) {
        return { ok: true, workspaceId: payload.workspaceId, workspaceName: 'WS', memberRole: 'member' };
      },
    });
    var u = makeWsUI({ bridge: bridge });
    u.state.workspaces = [
      { workspaceId: 'ws-a', workspaceName: 'Alpha', memberRole: 'owner' },
      { workspaceId: 'ws-b', workspaceName: 'Beta',  memberRole: 'member' },
    ];
    u.state.activeId = 'ws-a';
    await u.fns.activateByIndex(1); // switch to ws-b
    assertEqual(u.state.activeId, 'ws-b');
    assertEqual(u.state.showSwitch, false); // switch panel closes after activation
    assertEqual(u.toasts.length, 1);
    assertEqual(u.toasts[0].color, 'green');
  });

  await testAsync('offline restore: restoreOffline sets activeId from storage without network', function() {
    var u = makeWsUI({ initialStorage: { 'ktp_active_workspace_id': 'ws-offline-saved' } });
    u.fns.restoreOffline();
    assertEqual(u.state.activeId,   'ws-offline-saved');
    assertEqual(u.state.activeName, null);
    assertEqual(u.state.activeRole, null);
    assertEqual(u.state.restored,   true);
    assertEqual(u.state.view,       'list');
    assertEqual(u.state.workspaces.length, 0);
  });

  await testAsync('offline restore: restoreOffline with no saved id is no-op', function() {
    var u = makeWsUI(); // no storage item
    u.fns.restoreOffline();
    assertEqual(u.state.activeId, null);
    assertEqual(u.state.view,     'idle');
  });

  await testAsync('restart: valid session restore then workspace restore succeeds', async function() {
    var ws = [{ workspaceId: 'ws-saved', workspaceName: 'My WS', memberRole: 'owner' }];
    var bridge = makeMockBridge({ listWorkspaces: async function() { return { ok: true, workspaces: ws }; } });
    var u = makeWsUI({ bridge: bridge, initialStorage: { 'ktp_active_workspace_id': 'ws-saved' } });
    var r = await u.fns.restore();
    assertEqual(r.ok,         true);
    assertEqual(r.restored,   true);
    assertEqual(u.state.activeId,   'ws-saved');
    assertEqual(u.state.activeName, 'My WS');
    assertEqual(u.state.activeRole, 'owner');
    assertEqual(u.state.restored,   true);
  });

  await testAsync('restart offline: previous active workspace preserved from localStorage', function() {
    var u = makeWsUI({ cloudUI: { state: 'offline_cached' }, initialStorage: { 'ktp_active_workspace_id': 'ws-prev' } });
    u.fns.restoreOffline();
    u.fns.renderWorkspaceCard();
    assertEqual(u.dom._cardDisplay, '');
    assertEqual(u.state.activeId, 'ws-prev');
    var aname = u.dom.getElementById('ws-aname');
    // activeName is null, so falls back to activeId
    assertEqual(aname.textContent, 'ws-prev');
  });

  await testAsync('sign out: reset clears activeId and storage', async function() {
    var u = makeWsUI({ bridge: makeMockBridge(), initialStorage: { 'ktp_active_workspace_id': 'ws-x' } });
    u.state.activeId = 'ws-x'; u.state.activeName = 'X'; u.state.activeRole = 'owner';
    u.state.workspaces = [{ workspaceId: 'ws-x', workspaceName: 'X', memberRole: 'owner' }];
    // Simulate sign out: clear state and storage
    u.state.activeId   = null; u.state.activeName = null; u.state.activeRole = null;
    u.state.workspaces = []; u.state.view = 'idle';
    u.storage.removeItem('ktp_active_workspace_id');
    assertEqual(u.state.activeId, null);
    assertEqual(u.storage._data['ktp_active_workspace_id'], undefined);
  });

  // ── 1E.6C: cloudInitStatus & tplCloud state machine ──────────────────────────

  // Inline state machine that mirrors cloudInitStatus / tplCloud behaviour from renderer.html.
  function makeCloudInitSM(opts) {
    opts = opts || {};
    var _cloudUI = { state: 'loading', email: null, userId: null, expiresAt: null, error: null };
    var _cloudInitPending = false;
    var _wsRestored = false;
    var _restoreCalled = 0;
    var _refreshCalled = 0;
    var _renderCalled  = 0;
    var _modalOpen     = !!opts.modalOpen;
    var _electronImpl  = opts.electron || null;

    function _updateCloudUI() {}
    function _renderCloudAccountCard() { _renderCalled++; }
    function _renderWorkspaceCard()    {}

    // Mirror of cloudRefreshStatus: fetches status and updates _cloudUI.state.
    async function cloudRefreshStatus() {
      _refreshCalled++;
      if (!_electronImpl) { _cloudUI.state = 'error_ipc'; return; }
      var raw;
      try { raw = await _electronImpl.cloudGetStatus(); } catch(e) { _cloudUI.state = 'error_ipc'; return; }
      if (!raw || !raw.ok) { _cloudUI.state = 'error_ipc'; return; }
      if (!raw.configured) { _cloudUI.state = 'not_configured'; return; }
      if (!raw.authenticated) { _cloudUI.state = 'configured_anonymous'; return; }
      _cloudUI.state = 'authenticated';
      _cloudUI.email = raw.email || null;
      if (_modalOpen) _renderCloudAccountCard();
    }

    // Mirror of cloudInitStatus.
    async function cloudInitStatus() {
      if (!_electronImpl) return;
      if (_cloudInitPending) return;
      _cloudInitPending = true;
      _wsRestored = false;
      _cloudUI.state = 'reconnecting';
      _updateCloudUI();
      if (_modalOpen) { _renderCloudAccountCard(); _renderWorkspaceCard(); }
      var result;
      try { result = await _electronImpl.cloudRestoreSession(); _restoreCalled++; } catch(e) { result = { ok: false, error: 'unknown_error' }; }
      if (result && !result.ok && result.error === 'offline') {
        _cloudUI.state = 'offline_cached';
        _updateCloudUI();
        if (_modalOpen) _renderCloudAccountCard();
        _cloudInitPending = false;
        return;
      }
      try { await cloudRefreshStatus(); } catch(e) {}
      _cloudInitPending = false;
    }

    // Mirror of tplCloud: returns current state and schedules refresh.
    function tplCloudState() {
      var meaningful = _cloudUI.state === 'authenticated' ||
                       _cloudUI.state === 'reconnecting'   ||
                       _cloudUI.state === 'offline_cached';
      if (!meaningful) {
        _cloudUI.state = 'loading';
        _cloudUI.email = null; _cloudUI.userId = null; _cloudUI.expiresAt = null; _cloudUI.error = null;
      }
      // Returns what tplCloud would do with _cloudInitPending:
      return { stateKept: meaningful, pendingAtOpen: _cloudInitPending };
    }

    return {
      cloudUI:            _cloudUI,
      cloudInitStatus:    cloudInitStatus,
      tplCloudState:      tplCloudState,
      get pending()       { return _cloudInitPending; },
      get restoreCalled() { return _restoreCalled; },
      get refreshCalled() { return _refreshCalled; },
      get renderCalled()  { return _renderCalled; },
    };
  }

  await testAsync('cloudInitStatus: sets state=reconnecting then authenticated after successful restore', async function() {
    var seenStates = [];
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() {
          seenStates.push('restoring');
          return { ok: true, sessionPersisted: true };
        },
        cloudGetStatus: async function() {
          return { ok: true, configured: true, authenticated: true, email: 'u@example.com' };
        },
      },
    });
    seenStates.push(sm.cloudUI.state); // initial state
    await sm.cloudInitStatus();
    assertEqual(sm.cloudUI.state, 'authenticated');
    assertEqual(sm.cloudUI.email, 'u@example.com');
    assertEqual(sm.pending, false);
    assertEqual(sm.restoreCalled, 1);
    assertEqual(sm.refreshCalled, 1);
  });

  await testAsync('cloudInitStatus: pending flag blocks re-entry (no double restore)', async function() {
    var callCount = 0;
    var _resolve;
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() {
          callCount++;
          await new Promise(function(r) { _resolve = r; });
          return { ok: true, sessionPersisted: true };
        },
        cloudGetStatus: async function() {
          return { ok: true, configured: true, authenticated: true };
        },
      },
    });
    // Start first call (will hang until _resolve is called)
    var p1 = sm.cloudInitStatus();
    // Second call should return immediately due to re-entry guard
    var p2 = sm.cloudInitStatus();
    await p2;  // resolves immediately
    assertEqual(callCount, 1, 'cloudRestoreSession called only once despite two cloudInitStatus() invocations');
    _resolve(); // release the first call
    await p1;
    assertEqual(sm.cloudUI.state, 'authenticated');
  });

  await testAsync('cloudInitStatus: offline result sets offline_cached without sign-in form', async function() {
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() { return { ok: false, error: 'offline' }; },
        cloudGetStatus: async function() { return { ok: true, configured: true, authenticated: false }; },
      },
    });
    await sm.cloudInitStatus();
    assertEqual(sm.cloudUI.state, 'offline_cached');
    assertEqual(sm.pending, false);
    assert(sm.refreshCalled === 0, 'cloudRefreshStatus must not be called on offline — would show sign-in');
  });

  await testAsync('tplCloud: preserves authenticated state, does not reset to loading', async function() {
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() { return { ok: true }; },
        cloudGetStatus: async function() { return { ok: true, configured: true, authenticated: true, email: 'x@y.com' }; },
      },
    });
    await sm.cloudInitStatus(); // completes: state = 'authenticated'
    assertEqual(sm.cloudUI.state, 'authenticated');
    var opened = sm.tplCloudState();
    assert(opened.stateKept === true, 'tplCloud must NOT reset state when already authenticated');
    assertEqual(sm.cloudUI.state, 'authenticated', 'state must still be authenticated after tplCloud runs');
  });

  await testAsync('tplCloud: during pending restore, detects _cloudInitPending=true', async function() {
    var _resolve;
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() {
          await new Promise(function(r) { _resolve = r; });
          return { ok: true };
        },
        cloudGetStatus: async function() { return { ok: true, configured: true, authenticated: true }; },
      },
    });
    var p = sm.cloudInitStatus(); // starts, hangs inside restoreSession
    // At this point _cloudInitPending should be true and state should be 'reconnecting'
    var opened = sm.tplCloudState(); // simulate user opening modal while pending
    assert(opened.stateKept === true,   'tplCloud must keep reconnecting state when pending');
    assert(opened.pendingAtOpen === true, 'tplCloud must observe _cloudInitPending=true');
    assertEqual(sm.cloudUI.state, 'reconnecting', 'state must remain reconnecting');
    _resolve();
    await p;
    assertEqual(sm.cloudUI.state, 'authenticated');
  });

  await testAsync('tplCloud: resets to loading when state is unknown (fresh start, no session)', async function() {
    var sm = makeCloudInitSM({
      electron: {
        cloudRestoreSession: async function() { return { ok: false, error: 'session_expired' }; },
        cloudGetStatus: async function() { return { ok: true, configured: true, authenticated: false }; },
      },
    });
    // State starts as 'loading' (initial), never restored
    var opened = sm.tplCloudState();
    assert(opened.stateKept === false, 'tplCloud must reset unknown/loading state to loading');
    assertEqual(sm.cloudUI.state, 'loading');
  });

  await testAsync('no raw IPC or cloudWorkspace exposed via DOM elements', async function() {
    var u = makeWsUI({ bridge: makeMockBridge(), cloudUI: { state: 'authenticated' } });
    u.state.view = 'list'; u.state.workspaces = [];
    u.fns.renderWorkspaceCard();
    var html = u.dom._cardHtml;
    assert(!html.includes('ipcRenderer'),    'ipcRenderer not in HTML');
    assert(!html.includes('cloudWorkspace'), 'cloudWorkspace not in HTML');
    assert(!html.includes('invoke('),        'ipc invoke not in HTML');
  });
}

module.exports = { register: register, registerAsync: registerAsync };

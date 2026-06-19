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
  wsSyncNote: 'Cloud workspace connected. Backup is active.',
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
      var _canTryCreate = _state.error !== 'not_authenticated' &&
                          _state.error !== 'not_configured'    &&
                          _state.error !== 'license_required';
      html += '<div class="ws-error-card"><div id="ws-err-txt" class="ws-err-text"></div>' +
        '<div style="display:flex;gap:7px">' +
          '<button id="ws-retry-btn"></button>' +
          (_canTryCreate ? '<button id="ws-create-from-err"></button>' : '') +
        '</div></div>';
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
      var _cfe = _dom.getElementById('ws-create-from-err'); if (_cfe) _cfe.textContent = _t('wsCreate');
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

  test('sync status: 1F.5B — Sync Status section removed from main panel (confusing labels hidden)', function() {
    // Sync Status UI removed in 1F.5B: "not synced yet" / "local changes not tracked"
    // would confuse normal users since real sync/apply is not yet implemented.
    // wsRefreshSyncStatus() and SYNC_UI state remain intact for future use.
    assert(!/getElementById\('ws-sync-summary'\)[\s\S]{0,80}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-summary text-setting must be removed from main panel in 1F.5B');
    assert(!/getElementById\('ws-sync-refresh-btn'\)[\s\S]{0,80}\.textContent\s*=/.test(_rendererSrc),
      'ws-sync-refresh-btn text-setting must be removed from main panel in 1F.5B');
    // Function must still exist for future use
    assert(/async function wsRefreshSyncStatus/.test(_rendererSrc),
      'wsRefreshSyncStatus function must still exist in source');
  });

  test('sync status: getSyncStatus does not expose lock_held_by / pushed_by anywhere in renderer.html', function() {
    assert(!/lock_held_by/.test(_rendererSrc), 'lock_held_by must never appear in renderer.html');
    assert(!/pushed_by/.test(_rendererSrc),    'pushed_by must never appear in renderer.html');
  });

  // ── 1F.5B: Cloud UI copy/layout polish ─────────────────────────────────────

  test('1F.5B: misleading sync copy no longer appears in i18n (visible to users)', function() {
    // Old copy that was outdated/misleading — must not appear in i18n values
    assert(!/Sync and backup are not active yet/.test(_rendererSrc),
      '"Sync and backup are not active yet" must be removed from i18n (outdated since 1F.4F)');
    assert(!/Eşzamlama ve yedekleme henüz aktif değil/.test(_rendererSrc),
      'TR equivalent of outdated sync note must also be removed');
  });

  test('1F.5B: transitional "Automatic backup is coming" copy replaced with accurate message', function() {
    assert(!/Automatic backup is coming\./.test(_rendererSrc),
      '"Automatic backup is coming" must be replaced — auto-backup is live since 1F.4F');
    assert(/Cloud backup is ready/.test(_rendererSrc),
      '"Cloud backup is ready" must appear as the new accurate copy');
    assert(/backed up automatically/.test(_rendererSrc),
      '"backed up automatically" must appear in new wsBackupStatusNoBackup copy');
  });

  test('1F.5B: ws-sync-note shows updated connection status, not old sync warning', function() {
    // ws-sync-note still exists but with accurate text
    assert(/ws-sync-note/.test(_rendererSrc), 'ws-sync-note element must still exist');
    assert(/Cloud workspace connected/.test(_rendererSrc),
      'Updated wsSyncNote must say "Cloud workspace connected."');
    assert(/Backup is active/.test(_rendererSrc),
      'Updated wsSyncNote must say "Backup is active."');
  });

  test('1F.5B: Sync Status section not rendered in main panel (removed from HTML build)', function() {
    // The sync status section was removed from the active card HTML render.
    // Confusing labels ("Not synced yet", "Local changes not tracked") no longer shown.
    assert(!/ws-sync-refresh-btn/.test(_rendererSrc.match(/ws-sync-status-section[\s\S]{0,300}/)?.[0] || ''),
      'ws-sync-refresh-btn must not be inside an active ws-sync-status-section render block');
    // ws-sync-note still exists as a simple connection status
    assert(/ws-sync-note/.test(_rendererSrc), 'ws-sync-note must still exist for connection status');
  });

  test('1F.5B: dead i18n keys wsBackupPrepDownload and wsBackupDownloadBtn removed', function() {
    // These keys were removed in 1F.5B — they had no call sites in render code
    assert(!/wsBackupPrepDownload\s*:/.test(_rendererSrc),
      'wsBackupPrepDownload must be removed (dead key since 1F.4E)');
    assert(!/wsBackupDownloadBtn\s*:/.test(_rendererSrc),
      'wsBackupDownloadBtn must be removed (dead key since 1F.4E, superseded by wsBackupExportBtn)');
    // Replacement key must still exist
    assert(/wsBackupExportBtn/.test(_rendererSrc), 'wsBackupExportBtn must still exist');
  });

  test('1F.5B: no restore/apply/Settings controls added', function() {
    assert(!/onclick="wsRestoreBackup\(/.test(_rendererSrc), 'no restore button added');
    assert(!/onclick="wsApplyBackup\(/.test(_rendererSrc), 'no apply button added');
    assert(!/Settings > Cloud/.test(_rendererSrc), 'no Settings > Cloud panel added yet');
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
    // wsRefreshBackupReadiness is still in the source (called via auto-trigger), no visible button needed.
    assert(/wsRefreshBackupReadiness\(\)/.test(_rendererSrc), 'wsRefreshBackupReadiness must still exist in source');
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
    // 1F.4E: simplified main UI uses ws-bk-status-txt instead of ws-backup-summary
    assert(/getElementById\('ws-bk-status-txt'\)[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'ws-bk-status-txt must be set via textContent (1F.4E simplified status)');
    // Upload size confirmation still uses textContent (inside Advanced section)
    assert(/getElementById\('ws-backup-confirm-text'\)[\s\S]{0,400}\.textContent\s*=/.test(_rendererSrc),
      'ws-backup-confirm-text must be set via textContent');
  });

  test('backup readiness: renderer never references device id, storage path, or raw checksum', function() {
    assert(!/BACKUP_UI\.(deviceId|device_id|storagePath|storage_path|checksum)/.test(_rendererSrc),
      'BACKUP_UI must not carry device id / storage path / raw checksum');
  });

  test('backup readiness: no raw ipcRenderer usage anywhere in renderer.html', function() {
    assert(!/ipcRenderer/.test(_rendererSrc), 'renderer.html must never reference ipcRenderer directly');
  });

  // ── Backup list onclick safety (CLOUD-FOUNDATION-1F.4C-PREFLIGHT-CRASH-FIX) ──

  test('backup list: wsStartDownloadPreflight (if used) must not use JSON.stringify in onclick', function() {
    // JSON.stringify of a UUID string produces "uuid" (double-quotes) which breaks onclick="..." HTML.
    // In 1F.4E the Verify button was removed from the UI (wsStartDownloadPreflight is no longer
    // triggered via onclick). This check remains as a safety guard against regression.
    assert(!/wsStartDownloadPreflight\(JSON\.stringify/.test(_rendererSrc),
      'onclick must never use JSON.stringify with wsStartDownloadPreflight');
    // wsDownloadBackup (Export) must also use integer index, not string
    assert(!/wsDownloadBackup\(JSON\.stringify/.test(_rendererSrc),
      'wsDownloadBackup onclick must not use JSON.stringify');
  });

  test('backup list: wsStartDownloadPreflight onclick never calls restore/download bytes/apply', function() {
    assert(!/wsStartDownloadPreflight[\s\S]{0,300}restoreBackup/.test(_rendererSrc),
      'wsStartDownloadPreflight must not call restoreBackup');
    assert(!/wsStartDownloadPreflight[\s\S]{0,300}applyBackup/.test(_rendererSrc),
      'wsStartDownloadPreflight must not call applyBackup');
    assert(!/wsStartDownloadPreflight[\s\S]{0,300}downloadBytes/.test(_rendererSrc),
      'wsStartDownloadPreflight must not download bytes');
  });

  test('backup list: wsDownloadBackup never calls restore/apply/import (1F.4D)', function() {
    assert(!/wsDownloadBackup[\s\S]{0,600}restoreBackup/.test(_rendererSrc),
      'wsDownloadBackup must not call restoreBackup');
    assert(!/wsDownloadBackup[\s\S]{0,600}applyBackup/.test(_rendererSrc),
      'wsDownloadBackup must not call applyBackup');
    assert(!/wsDownloadBackup[\s\S]{0,600}DATA\s*=/.test(_rendererSrc),
      'wsDownloadBackup must not overwrite DATA');
    assert(/wsDownloadBackup[\s\S]{0,800}downloadBackupToFile/.test(_rendererSrc),
      'wsDownloadBackup must call bridge.downloadBackupToFile');
  });

  test('backup list: download UI note uses textContent not innerHTML', function() {
    assert(/getElementById\('ws-bkpl-dlst-[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'download status must be set via textContent');
  });

  // ── Error-state recovery UI (CLOUD-FOUNDATION-1F.4B-REMOTE-GATE-C1) ──────────

  test('error state: unknown_error shows ws-create-from-err button', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'unknown_error';
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must appear for unknown_error');
  });

  test('error state: workspace_not_found shows ws-create-from-err button', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'workspace_not_found';
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must appear for workspace_not_found');
  });

  test('error state: network_error shows ws-create-from-err button', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'network_error';
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must appear for network_error');
  });

  test('error state: not_authenticated hides ws-create-from-err (must re-auth first)', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'not_authenticated';
    u.fns.renderWorkspaceCard();
    assert(!u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must NOT appear when not authenticated');
  });

  test('error state: not_configured hides ws-create-from-err (admin config issue)', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'not_configured';
    u.fns.renderWorkspaceCard();
    assert(!u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must NOT appear when not configured');
  });

  test('error state: license_required hides ws-create-from-err', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'license_required';
    u.fns.renderWorkspaceCard();
    assert(!u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must NOT appear when license required');
  });

  test('error state: ws-create-from-err text is set via textContent not innerHTML', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'unknown_error';
    u.fns.renderWorkspaceCard();
    var btn = u.dom._els['ws-create-from-err'];
    assert(btn, 'ws-create-from-err element must exist');
    assertEqual(btn.textContent, 'Create Workspace', 'text must be set via textContent');
    assertEqual(btn.innerHTML, '', 'innerHTML must be empty — text set via textContent only');
  });

  test('error state: no sensitive fields in error view HTML', function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'unknown_error';
    u.fns.renderWorkspaceCard();
    var html = u.dom._cardHtml;
    FORBIDDEN_FIELDS.forEach(function(f) {
      assert(!html.includes(f), 'error view HTML must not contain: ' + f);
    });
  });

  // ── 1F.4E UX simplification checks ─────────────────────────────────────────

  test('1F.4E: main backup section shows simple status, not raw readiness details', function() {
    // ws-bk-status-txt is the new simple status element
    assert(/getElementById\('ws-bk-status-txt'\)/.test(_rendererSrc),
      'simple status element ws-bk-status-txt must exist');
    // ws-backup-summary (old detailed readiness) must not be a primary element
    assert(!/getElementById\('ws-backup-summary'\)[\s\S]{0,100}\.textContent/.test(_rendererSrc),
      'ws-backup-summary must no longer be set — simplified in 1F.4E');
  });

  test('1F.4E: Verify button is not a primary user-facing control', function() {
    // The Verify step is internal; no onclick wired to wsStartDownloadPreflight in the HTML
    assert(!/onclick="wsStartDownloadPreflight\(/.test(_rendererSrc),
      'wsStartDownloadPreflight must not have an onclick button in 1F.4E');
  });

  test('1F.4E: backup history is inside Advanced section (controlled by advExpanded)', function() {
    // The Advanced toggle uses wsToggleBackupAdvanced
    assert(/onclick="wsToggleBackupAdvanced\(\)"/.test(_rendererSrc),
      'wsToggleBackupAdvanced must be wired to Advanced toggle button');
    // advExpanded controls visibility of the Advanced content block
    assert(/BACKUP_UI\.advExpanded/.test(_rendererSrc),
      'BACKUP_UI.advExpanded must be referenced in render logic');
    // ws-bkpl-hdr (history header) must exist in source (inside Advanced)
    assert(/ws-bkpl-hdr/.test(_rendererSrc),
      'ws-bkpl-hdr must exist (inside Advanced section)');
    // The Advanced content div class is present
    assert(/ws-bk-adv-content/.test(_rendererSrc),
      'ws-bk-adv-content must be the Advanced collapsible container');
  });

  test('1F.4E: Export backup file button replaces Verify+Download two-step flow', function() {
    // wsDownloadBackup is the Export handler (does preflight internally)
    assert(/onclick="wsDownloadBackup\(/.test(_rendererSrc),
      'wsDownloadBackup must be wired as the Export button');
    // The safety note must appear inside the Advanced section
    assert(/ws-bk-export-note/.test(_rendererSrc),
      'ws-bk-export-note must exist inside Advanced section');
  });

  test('1F.4E: no restore button exists anywhere in backup section', function() {
    assert(!/onclick="wsRestoreBackup\(/.test(_rendererSrc), 'no restore button allowed');
    assert(!/onclick="wsApplyBackup\(/.test(_rendererSrc),   'no apply button allowed');
    assert(!/onclick="wsImport\(/.test(_rendererSrc),        'no import button allowed');
  });

  // ── 1F.4F: Automatic cloud backup checks ───────────────────────────────────

  test('1F.4F: _scheduleAutoCloudBackup is called from the active saveLocal (HOTFIX version)', function() {
    assert(/_scheduleAutoCloudBackup\(\)/.test(_rendererSrc),
      '_scheduleAutoCloudBackup must be defined');
    // The active saveLocal HOTFIX uses setSetting('selected_month') — unique to it.
    // The 1F.4F hook must appear within a small window after that call.
    assert(/setSetting\('selected_month'[\s\S]{0,800}_scheduleAutoCloudBackup\(\)/.test(_rendererSrc),
      '_scheduleAutoCloudBackup hook must be present after setSetting in the active saveLocal');
  });

  test('1F.4F: AUTO_BACKUP_UI state is defined with fingerprint fields', function() {
    assert(/var AUTO_BACKUP_UI\s*=/.test(_rendererSrc), 'AUTO_BACKUP_UI state must exist');
    assert(/AUTO_BACKUP_UI\.state/.test(_rendererSrc), 'AUTO_BACKUP_UI.state must be referenced');
    assert(/AUTO_BACKUP_UI\.lastSuccessAt/.test(_rendererSrc), 'AUTO_BACKUP_UI.lastSuccessAt must exist');
    assert(/AUTO_BACKUP_UI\.lastUploadedHash/.test(_rendererSrc), 'lastUploadedHash must exist');
    assert(/AUTO_BACKUP_UI\.pendingHash/.test(_rendererSrc), 'pendingHash must exist');
    assert(/AUTO_BACKUP_UI\.inFlight/.test(_rendererSrc), 'inFlight must exist');
  });

  test('1F.4F: _scheduleAutoCloudBackup checks fingerprint before resetting timer', function() {
    assert(/_djb2Hash/.test(_rendererSrc), '_djb2Hash function must exist');
    assert(/lastUploadedHash/.test(_rendererSrc), 'lastUploadedHash check must exist');
    assert(/pendingHash/.test(_rendererSrc), 'pendingHash comparison must exist');
    assert(/hash === AUTO_BACKUP_UI\.lastUploadedHash/.test(_rendererSrc),
      'must short-circuit when hash matches lastUploadedHash');
    assert(/hash === AUTO_BACKUP_UI\.pendingHash/.test(_rendererSrc),
      'must short-circuit when hash matches pendingHash and timer running');
  });

  test('1F.4F: scheduler does not check CLOUD_UI.state — auth deferred to tick time', function() {
    // ROOT CAUSE FIX: the scheduler must NOT require cloud auth state.
    // Auth checks happen in wsAutoBackupTick(), not in _scheduleAutoCloudBackup().
    // Extract scheduler body by stopping at the async tick function that follows it.
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\(\)([\s\S]*?)async function wsAutoBackupTick/);
    assert(schedFn, '_scheduleAutoCloudBackup must be extractable before wsAutoBackupTick');
    var body = schedFn[1];
    // The scheduler body must not contain any CLOUD_UI reference
    assert(!/CLOUD_UI/.test(body),
      '_scheduleAutoCloudBackup body must NOT reference CLOUD_UI (auth deferred to tick)');
  });

  test('1F.4F: wsAutoBackupTick handles non-authenticated states by retrying not erroring', function() {
    // Transient states (loading, reconnecting, offline_cached) must trigger retry
    assert(/loading.*retry|reconnecting.*retry|offline_cached.*retry|_scheduleAutoRetry.*loading|_scheduleAutoRetry.*reconnecting/.test(
      _rendererSrc.replace(/\s+/g, ' ')),
      'wsAutoBackupTick must retry on transient non-authenticated states');
  });

  test('1F.4F: dev diagnostics use _abLog and never log DATA contents or secrets', function() {
    assert(/_abLog/.test(_rendererSrc), '_abLog diagnostic function must exist');
    assert(/_abDevMode/.test(_rendererSrc), '_abDevMode guard must exist');
    // Silent by default — explicit debug flag required (1F.4F-DEBUG-LOG-CLEANUP)
    assert(/__KTP_AUTO_BACKUP_DEBUG/.test(_rendererSrc),
      '__KTP_AUTO_BACKUP_DEBUG gate must exist in _abLog');
    // Extract _abLog body and confirm it contains the debug flag check
    var abLogBody = _rendererSrc.match(/function _abLog\(msg,\s*extra\)\s*\{([\s\S]*?)\n\}/);
    assert(abLogBody, '_abLog function body must be extractable');
    assert(/__KTP_AUTO_BACKUP_DEBUG/.test(abLogBody[1]),
      '_abLog body must check __KTP_AUTO_BACKUP_DEBUG — silent by default');
    // Confirm log calls contain no sensitive field references
    assert(!/abLog.*password|abLog.*token|abLog.*checksum|abLog.*storage_path/.test(_rendererSrc),
      '_abLog must never reference passwords, tokens, checksums, or storage paths');
    assert(!/abLog.*JSON\.stringify\(DATA\)/.test(_rendererSrc),
      '_abLog must never log full DATA contents');
  });

  test('1F.4F: _scheduleAutoRetry exists for automatic retry after failure', function() {
    assert(/function _scheduleAutoRetry/.test(_rendererSrc),
      '_scheduleAutoRetry must be defined');
    assert(/_autoBackupRetryTimer/.test(_rendererSrc),
      'separate retry timer must exist');
    // Retry fires wsAutoBackupTick without requiring a DATA change
    assert(/_scheduleAutoRetry[\s\S]{0,400}wsAutoBackupTick/.test(_rendererSrc),
      '_scheduleAutoRetry must call wsAutoBackupTick');
  });

  test('1F.4F: inFlight guard prevents concurrent uploads', function() {
    assert(/AUTO_BACKUP_UI\.inFlight\s*=\s*true/.test(_rendererSrc), 'inFlight must be set to true');
    assert(/AUTO_BACKUP_UI\.inFlight\s*=\s*false/.test(_rendererSrc), 'inFlight must be reset to false');
    assert(/if.*inFlight.*return/.test(_rendererSrc), 'must return early when inFlight');
  });

  test('1F.4F: wsAutoBackupTick calls createAutoBackup not createManualBackup', function() {
    assert(/wsAutoBackupTick[\s\S]{0,4500}createAutoBackup/.test(_rendererSrc),
      'wsAutoBackupTick must call bridge.createAutoBackup');
    assert(!/wsAutoBackupTick[\s\S]{0,4500}createManualBackup/.test(_rendererSrc),
      'wsAutoBackupTick must NOT call createManualBackup');
  });

  test('1F.4F: wsAutoBackupTick never calls restore/apply/import', function() {
    assert(!/wsAutoBackupTick[\s\S]{0,4500}restoreBackup/.test(_rendererSrc),
      'auto backup must not call restoreBackup');
    assert(!/wsAutoBackupTick[\s\S]{0,4500}DATA\s*=[^=]/.test(_rendererSrc),
      'auto backup must not overwrite DATA');
  });

  test('1F.4F: auto backup does not trigger a toast on success', function() {
    // Extract just the wsAutoBackupTick function body (up to _scheduleAutoRetry def)
    var tickMatch = _rendererSrc.match(/async function wsAutoBackupTick\(\)([\s\S]*?)function _scheduleAutoRetry/);
    assert(tickMatch, 'wsAutoBackupTick function body must be extractable');
    assert(!/toast\(/.test(tickMatch[1]),
      'wsAutoBackupTick body must not call toast() — silent background operation');
  });

  test('1F.4F: debounce timer uses setTimeout not setInterval (renamed variable)', function() {
    assert(/_autoBackupDebounceTimer\s*=\s*setTimeout/.test(_rendererSrc),
      'auto-backup debounce must use setTimeout (not setInterval)');
    assert(/_autoBackupRetryTimer\s*=\s*setTimeout/.test(_rendererSrc),
      'retry timer must also use setTimeout');
    assert(!/setInterval[\s\S]{0,80}wsAutoBackupTick/.test(_rendererSrc),
      'wsAutoBackupTick must not be used with setInterval');
  });

  test('1F.4E: Advanced section safety note uses textContent', function() {
    assert(/getElementById\('ws-bk-export-note'\)[\s\S]{0,200}\.textContent\s*=/.test(_rendererSrc),
      'export note must be set via textContent, not innerHTML');
  });

  // ── 1F.4G: Online/offline awareness ─────────────────────────────────────────

  test('1F.4G: online event listener exists and triggers fast retry', function() {
    assert(/addEventListener\('online'/.test(_rendererSrc),
      'window must have an online event listener');
    assert(/addEventListener\('offline'/.test(_rendererSrc),
      'window must have an offline event listener');
  });

  test('1F.4G: online handler calls _scheduleAutoRetry with fast delay', function() {
    var onlineBlock = _rendererSrc.match(/addEventListener\('online'[\s\S]*?addEventListener\('offline'/);
    assert(onlineBlock, 'online handler must be found before offline handler');
    var body = onlineBlock[0];
    assert(/_scheduleAutoRetry/.test(body),
      'online handler must call _scheduleAutoRetry');
    assert(/AUTO_BACKUP_ONLINE_MS/.test(body),
      'online handler must pass AUTO_BACKUP_ONLINE_MS for fast retry');
  });

  test('1F.4G: online handler has inFlight guard to prevent duplicate uploads', function() {
    var onlineBlock = _rendererSrc.match(/addEventListener\('online'[\s\S]*?addEventListener\('offline'/);
    assert(onlineBlock, 'online handler must be found');
    assert(/inFlight/.test(onlineBlock[0]),
      'online handler must check inFlight before scheduling retry');
  });

  test('1F.4G: _scheduleAutoRetry accepts optional delayMs parameter', function() {
    assert(/function _scheduleAutoRetry\(\s*delayMs\s*\)/.test(_rendererSrc),
      '_scheduleAutoRetry must accept optional delayMs parameter');
    assert(/AUTO_BACKUP_ONLINE_MS/.test(_rendererSrc),
      'AUTO_BACKUP_ONLINE_MS constant must exist for fast online retry');
  });

  test('1F.4G: online retry uses same _autoBackupRetryTimer — no duplicate timers', function() {
    // _scheduleAutoRetry always clears existing timer before setting new one.
    // This prevents a slow 5-min timer from running alongside a fast 5-sec one.
    var retryFn = _rendererSrc.match(/function _scheduleAutoRetry[\s\S]*?^function /m);
    assert(retryFn, '_scheduleAutoRetry body must be extractable');
    var body = retryFn[0];
    assert(/clearTimeout\(_autoBackupRetryTimer\)/.test(body),
      '_scheduleAutoRetry must clear existing timer before setting new one');
  });

  test('1F.4G: offline handler does not block local save or clear pending state', function() {
    var offlineBlock = _rendererSrc.match(/addEventListener\('offline'[\s\S]{0,400}/);
    assert(offlineBlock, 'offline handler must exist');
    var body = offlineBlock[0];
    assert(!/pendingHash\s*=\s*null/.test(body),
      'offline handler must NOT clear pendingHash — pending backup is preserved');
    assert(!/AUTO_BACKUP_UI\.state\s*=\s*['"]\s*idle/.test(body),
      'offline handler must NOT set state to idle');
  });

  test('1F.4G: no noisy default logs — debug flag required for online/offline log output', function() {
    // _abLog requires __KTP_AUTO_BACKUP_DEBUG — online/offline logs are gated
    var abLogBody = _rendererSrc.match(/function _abLog\(msg,\s*extra\)\s*\{([\s\S]*?)\n\}/);
    assert(abLogBody, '_abLog must be found');
    assert(/__KTP_AUTO_BACKUP_DEBUG/.test(abLogBody[1]),
      'online/offline diagnostic logs must remain gated behind __KTP_AUTO_BACKUP_DEBUG');
  });

  test('1F.4G: no restore/apply/import in online/offline handlers', function() {
    var handlers = _rendererSrc.match(/addEventListener\('online'[\s\S]*?addEventListener\('offline'[\s\S]{0,400}/);
    assert(handlers, 'online/offline handlers must be found');
    assert(!/restoreBackup|applyBackup|syncApply|DATA\s*=/.test(handlers[0]),
      'online/offline handlers must not call restore/apply or overwrite DATA');
  });

  // ── 1F.4H: Persistent cloud backup status indicator ─────────────────────────

  test('1F.4H: cloud-backup-indicator DOM element exists in topbar', function() {
    assert(/id="cloud-backup-indicator"/.test(_rendererSrc),
      'cloud-backup-indicator element must be in the HTML');
    assert(/role="status"/.test(_rendererSrc),
      'indicator must have role="status" for accessibility');
  });

  test('1F.4H: renderAutoBackupIndicator function exists and reads safe fields only', function() {
    assert(/function renderAutoBackupIndicator\(\)/.test(_rendererSrc),
      'renderAutoBackupIndicator must be defined');
    // Must read from AUTO_BACKUP_UI.state (the safe state field)
    assert(/AUTO_BACKUP_UI\.state/.test(_rendererSrc),
      'renderAutoBackupIndicator must reference AUTO_BACKUP_UI.state');
  });

  test('1F.4H: indicator does not expose internal fields to the UI', function() {
    var fnMatch = _rendererSrc.match(/function renderAutoBackupIndicator\(\)([\s\S]*?)function renderWorkspaceCard/);
    assert(fnMatch, 'renderAutoBackupIndicator body must be extractable');
    var body = fnMatch[1];
    // These internal fields must NEVER appear in what is rendered to the DOM
    var forbidden = ['pendingHash','lastUploadedHash','nextRetryAt','backupId',
      'storage_path','storagePath','checksum','device_id','archiveStr',
      'access_token','refresh_token','rendererState'];
    forbidden.forEach(function(f) {
      assert(!body.includes(f), 'indicator must not reference: ' + f);
    });
  });

  test('1F.4H: indicator state mapping covers ok/pending/uploading/error', function() {
    var fnMatch = _rendererSrc.match(/function renderAutoBackupIndicator\(\)([\s\S]*?)function renderWorkspaceCard/);
    assert(fnMatch, 'renderAutoBackupIndicator body must be extractable');
    var body = fnMatch[1];
    assert(/cloudBkOk/.test(body),      'ok state must use cloudBkOk i18n key');
    assert(/cloudBkPending/.test(body),  'pending state must use cloudBkPending i18n key');
    assert(/cloudBkUploading/.test(body),'uploading state must use cloudBkUploading i18n key');
    assert(/cloudBkError/.test(body),    'error state must use cloudBkError i18n key');
  });

  test('1F.4H: indicator uses title/aria-label via property assignment not innerHTML', function() {
    var fnMatch = _rendererSrc.match(/function renderAutoBackupIndicator\(\)([\s\S]*?)function renderWorkspaceCard/);
    assert(fnMatch, 'renderAutoBackupIndicator body must be extractable');
    var body = fnMatch[1];
    assert(/el\.title\s*=/.test(body),                'title must be set via el.title property');
    assert(/el\.setAttribute\('aria-label'/.test(body),'aria-label must be set via setAttribute');
    assert(!/innerHTML/.test(body),                    'must not use innerHTML');
  });

  test('1F.4H: indicator hidden when not authenticated or no workspace', function() {
    var fnMatch = _rendererSrc.match(/function renderAutoBackupIndicator\(\)([\s\S]*?)function renderWorkspaceCard/);
    assert(fnMatch, 'renderAutoBackupIndicator body must be extractable');
    var body = fnMatch[1];
    assert(/cloud-bk-hidden/.test(body),
      'indicator must have hidden class when conditions not met');
    assert(/CLOUD_UI\.state\s*!==\s*'authenticated'/.test(body),
      'indicator must check CLOUD_UI.state for visibility');
    assert(/WS_UI\.activeId/.test(body),
      'indicator must check WS_UI.activeId for visibility');
  });

  test('1F.4H: renderAutoBackupIndicator is called from renderWorkspaceCard', function() {
    // Verify the call is at the top of renderWorkspaceCard (before early return for non-auth)
    var wcBody = _rendererSrc.match(/function renderWorkspaceCard\(\)([\s\S]{0,200})/);
    assert(wcBody, 'renderWorkspaceCard must be found');
    assert(/renderAutoBackupIndicator\(\)/.test(wcBody[1]),
      'renderAutoBackupIndicator must be called near the start of renderWorkspaceCard');
  });

  test('1F.4H: CSS animation pulse exists for pending/uploading states', function() {
    assert(/cloud-bk-pulse/.test(_rendererSrc), 'cloud-bk-pulse CSS class must exist');
    assert(/cloud-bk-warn/.test(_rendererSrc), 'cloud-bk-warn color class must exist');
    assert(/cloud-bk-ok/.test(_rendererSrc), 'cloud-bk-ok color class must exist');
    assert(/@keyframes cloud-bk-pulse/.test(_rendererSrc), 'pulse keyframe animation must exist');
  });

  test('1F.4H: indicator CSS dot is visually large enough to notice (>=9px) with ring (1F.4H-UI-VISIBILITY-FIX)', function() {
    // Extract indicator base CSS block and confirm dot size >= 9px
    var cssBlock = _rendererSrc.match(/\.cloud-bk-indicator\{[^}]+\}/);
    assert(cssBlock, '.cloud-bk-indicator CSS block must exist');
    var block = cssBlock[0];
    // Width must be 10px (or more) — was 7px before the visibility fix
    assert(/width:\s*(9|10|1[1-9]|[2-9]\d)px/.test(block),
      'cloud-bk-indicator width must be at least 9px for visibility');
    assert(/height:\s*(9|10|1[1-9]|[2-9]\d)px/.test(block),
      'cloud-bk-indicator height must be at least 9px for visibility');
    // Ring (box-shadow) adds effective visual target > 14px combined
    assert(/box-shadow/.test(_rendererSrc),
      'colored ring via box-shadow must exist on cloud-bk-ok/warn/error for contrast on both themes');
  });

  test('1F.4H: no restore/apply/import in renderAutoBackupIndicator', function() {
    var fnMatch = _rendererSrc.match(/function renderAutoBackupIndicator\(\)([\s\S]*?)function renderWorkspaceCard/);
    assert(fnMatch, 'renderAutoBackupIndicator body must be extractable');
    assert(!/restoreBackup|applyBackup|syncApply|DATA\s*=/.test(fnMatch[1]),
      'renderAutoBackupIndicator must not call restore/apply or overwrite DATA');
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

  // ── Error-state recovery (CLOUD-FOUNDATION-1F.4B-REMOTE-GATE-C1) ─────────────

  await testAsync('error state: loadWorkspaces failure with unknown_error shows create button', async function() {
    var u = makeWsUI({
      bridge: makeMockBridge({
        listWorkspaces: async function() { return { ok: false, error: 'unknown_error' }; },
      }),
      cloudUI: { state: 'authenticated' },
    });
    await u.fns.loadWorkspaces();
    assertEqual(u.state.view, 'error');
    assertEqual(u.state.error, 'unknown_error');
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'ws-create-from-err must be present after unknown_error from loadWorkspaces');
  });

  await testAsync('error state: create from error view transitions to create view', async function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'unknown_error';
    u.fns.renderWorkspaceCard();
    assert(u.dom._cardHtml.includes('id="ws-create-from-err"'), 'create button must exist in error view');
    u.fns.showCreate();
    assertEqual(u.state.view, 'create', 'showCreate must transition to create view');
    assert(u.dom._cardHtml.includes('id="ws-create-btn"'), 'create form must be rendered');
  });

  await testAsync('error state: not_authenticated error does not offer create path', async function() {
    var u = makeWsUI({ cloudUI: { state: 'authenticated' } });
    u.state.view = 'error'; u.state.error = 'not_authenticated';
    u.fns.renderWorkspaceCard();
    assert(!u.dom._cardHtml.includes('id="ws-create-from-err"'),
      'create button must NOT appear for not_authenticated error');
    assert(u.dom._cardHtml.includes('id="ws-retry-btn"'),
      'retry button must always be present in error view');
  });
}

module.exports = { register: register, registerAsync: registerAsync };

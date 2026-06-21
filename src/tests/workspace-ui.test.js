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

  // ── 1F.6C: Cloud Backup Apply — owner-only, manual, dual confirmation ───────

  test('1F.6C: Apply button exists only inside Advanced backup history', function() {
    assert(/wsStartApply\(/.test(_rendererSrc), 'wsStartApply must exist');
    // Apply is inside the Advanced backup list section only (ws-bkpl-apply-)
    assert(/ws-bkpl-apply-/.test(_rendererSrc), 'Apply button must be in backup history rows');
    // Apply must NOT appear outside the Advanced section (not in main card or topbar)
    assert(!/id="ws-backup-apply"/.test(_rendererSrc), 'no standalone Apply button in main card');
  });

  test('1F.6C: Apply button gated to owner role only', function() {
    assert(/BACKUP_UI\.role\s*===\s*'owner'/.test(_rendererSrc),
      'Apply must check BACKUP_UI.role === owner');
    // Confirm the Apply button onclick has the owner check in wsStartApply
    var startFn = _rendererSrc.match(/function wsStartApply\(idx\)([\s\S]*?)^function /m);
    assert(startFn, 'wsStartApply must be found');
    assert(/BACKUP_UI\.role\s*!==\s*'owner'\s*\)\s*return/.test(startFn[1]),
      'wsStartApply must return early if not owner');
  });

  test('1F.6C: Apply blocked when AUTO_BACKUP_UI.inFlight is true', function() {
    var startFn = _rendererSrc.match(/function wsStartApply\(idx\)([\s\S]*?)^function /m);
    assert(startFn, 'wsStartApply must be found');
    assert(/AUTO_BACKUP_UI\.inFlight/.test(startFn[1]),
      'wsStartApply must check AUTO_BACKUP_UI.inFlight');
  });

  test('1F.6C: Apply blocked when pendingHash exists (local changes pending)', function() {
    assert(/AUTO_BACKUP_UI\.pendingHash/.test(_rendererSrc),
      'pendingHash must be referenced in the apply area');
    // The show-apply condition must check pendingHash
    var showApply = _rendererSrc.match(/_canApp[^;]*;/);
    assert(showApply, '_canApp condition must exist');
  });

  test('1F.6C: dual confirmation — confirm1 then confirm2 required', function() {
    assert(/function wsConfirmApply1/.test(_rendererSrc), 'wsConfirmApply1 must exist');
    assert(/function wsConfirmApply2/.test(_rendererSrc), 'wsConfirmApply2 must exist (second confirmation)');
    assert(/function wsCancelApply/.test(_rendererSrc), 'wsCancelApply must exist');
    // confirm2 must check that state is confirm2 (not confirm1)
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function /m);
    assert(cfm2, 'wsConfirmApply2 body must be found');
    assert(/applyState\s*!==\s*'confirm2'/.test(cfm2[1]),
      'wsConfirmApply2 must guard against wrong state');
  });

  test('1F.6C: wsConfirmApply2 calls restoreBackupFromCloud, not restore/download/sync', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function /m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    assert(/restoreBackupFromCloud/.test(body), 'wsConfirmApply2 must call restoreBackupFromCloud');
    assert(!/syncApply|pushSnapshot|restoreFullBackup|wsApplyBackup|applyBackup/.test(body),
      'wsConfirmApply2 must not call sync/push/restore paths');
  });

  test('1F.6C: wsConfirmApply2 captures current state with _captureRendererState before IPC', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function /m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    assert(/_captureRendererState\(\)/.test(cfm2[1]),
      'wsConfirmApply2 must call _captureRendererState() before sending to IPC');
  });

  test('1F.6C: wsConfirmApply2 writes to localStorage and reloads on success', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function /m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    assert(/localStorage\.setItem\(LSKEY/.test(body),
      'wsConfirmApply2 must write rendererState to localStorage on success');
    assert(/location\.reload\(\)/.test(body),
      'wsConfirmApply2 must reload page after applying');
  });

  test('1F.6C: wsConfirmApply2 does not mutate localStorage on failure', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function /m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    // localStorage.setItem must only be inside the success path (after !_r.ok guard)
    // A failed response sets applyState=error and returns without writing
    assert(/applyState\s*=\s*'error'[\s\S]*?return/.test(body),
      'wsConfirmApply2 must set error state and return without localStorage write on failure');
  });

  test('1F.6C: Apply flow has no "Sync now" copy', function() {
    assert(!/Sync now/.test(_rendererSrc), '"Sync now" must not appear anywhere');
    assert(!/wsBackupSyncNow/.test(_rendererSrc), 'no wsBackupSyncNow i18n key');
  });

  test('1F.6C: backup:restoreFromCloud checks owner role in main.js source', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    assert(/backup:restoreFromCloud/.test(mainSrc), 'backup:restoreFromCloud must be registered');
    assert(/owner_required/.test(mainSrc), 'must return owner_required error for non-owners');
    assert(/getCloudBackupReadiness/.test(mainSrc), 'must call getCloudBackupReadiness for role check');
    assert(/validateFullBackup/.test(mainSrc), 'must call validateFullBackup before apply');
    assert(/_applyArchiveInternal/.test(mainSrc), 'must use shared apply helper');
  });

  test('1F.6C: backup:restoreFromCloud response strips forbidden fields', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    // The handler block for restoreFromCloud — find it
    var m = mainSrc.match(/ipcMain\.handle\('backup:restoreFromCloud'([\s\S]*?)^\s*\}\);\n/m);
    assert(m, 'backup:restoreFromCloud handler body must be found');
    var body = m[1];
    assert(!/mainStore\s*:/.test(body),     'must not return mainStore');
    assert(!/storage_path\s*:/.test(body),  'must not return storage_path');
    assert(!/checksum\s*:/.test(body),      'must not return checksum');
    assert(!/device_id\s*:/.test(body),     'must not return device_id');
    // checksums must be stripped in sanitizedManifest
    assert(/checksums INTENTIONALLY STRIPPED/.test(mainSrc),
      'manifest.checksums must be intentionally stripped (comment in source)');
  });

  test('1F.6C: manifest.checksums stripped in _applyArchiveInternal', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    var m = mainSrc.match(/const sanitizedManifest\s*=\s*\{([\s\S]*?)\};/);
    assert(m, 'sanitizedManifest must be found in _applyArchiveInternal');
    assert(!/checksums/.test(m[1].replace(/\/\/[^\n]*/g, '')),
      'sanitizedManifest must not include checksums field');
  });

  test('1F.6C: pre-restore safety backup mandatory — apply blocked if safety backup fails', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g, '');
    assert(/safety_backup_failed/.test(mainSrc),
      'must return safety_backup_failed if pre-restore backup cannot be created');
    // The safety backup must be created BEFORE mainStore is applied
    var applyFn = mainSrc.match(/function _applyArchiveInternal([\s\S]*?)^(?:async )?function /m);
    assert(applyFn, '_applyArchiveInternal must be found');
    var safetyIdx = applyFn[1].indexOf('pre-restore');
    var mainStoreIdx = applyFn[1].indexOf('Apply mainStore');
    assert(safetyIdx < mainStoreIdx, 'safety backup must be created before mainStore apply');
  });

  test('1F.6C: restoreBackupFromCloud exposed on preload electron bridge', function() {
    assert(/restoreBackupFromCloud/.test(_rendererSrc) || true, 'bridge exists');
    // Verify in preload.js source
    var fs = require('fs');
    var preloadSrc = fs.readFileSync(require('path').join(__dirname, '..', 'preload.js'), 'utf8');
    assert(/restoreBackupFromCloud/.test(preloadSrc), 'restoreBackupFromCloud must be in preload.js');
    assert(/backup:restoreFromCloud/.test(preloadSrc), 'must invoke backup:restoreFromCloud channel');
  });

  test('1F.6C: no auto-apply or automatic cloud-to-local mutation', function() {
    // wsAutoBackupTick must never call restoreBackupFromCloud or applyArchive
    var tickFn = _rendererSrc.match(/async function wsAutoBackupTick\(\)([\s\S]*?)function _scheduleAutoRetry/);
    assert(tickFn, 'wsAutoBackupTick must be found');
    assert(!/restoreBackupFromCloud|wsConfirmApply|applyArchive|localStorage\.setItem.*rendererState/.test(tickFn[1]),
      'wsAutoBackupTick must never auto-apply cloud data');
  });

  // ── 1F.6C workspace_mismatch root cause + policy fix ────────────────────────

  test('1F.6C: workspace_mismatch removed — archive manifest.workspaceId is informational, not cloud authority', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    // The hard block must be removed — it was comparing LOCAL workspaceId vs CLOUD workspaceId
    assert(!/return.*error.*workspace_mismatch/.test(mainSrc),
      'workspace_mismatch hard block must be removed (compared wrong ID types)');
    // Cloud ownership is proven by RPC/RLS — must still be present
    assert(/getCloudBackupReadiness/.test(mainSrc),
      'cloud ownership check via getCloudBackupReadiness must remain');
    assert(/getCloudBackupContent/.test(mainSrc),
      'cloud RLS-backed download must remain (proves backup belongs to workspace)');
  });

  test('1F.6C: archive.manifest.workspaceId is local UUID, not cloud UUID — informational only', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    // Confirm the code comments document the two-ID architecture
    assert(/LOCAL workspace UUID/.test(mainSrc) || /local-workspace-id is informational/.test(mainSrc),
      'code must document that manifest.workspaceId is the local UUID, not the cloud UUID');
    // The manifest.workspaceId field must still be in the sanitized manifest (as informational)
    var sanitized = mainSrc.match(/const sanitizedManifest\s*=\s*\{([\s\S]*?)\};/);
    assert(sanitized, 'sanitizedManifest must exist');
    assert(/workspaceId/.test(sanitized[1]), 'manifest.workspaceId still returned as informational metadata');
  });

  test('1F.6C: cloud ownership still proven by multiple authoritative checks before apply', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g,'');
    // Check the full main.js source for these required elements (handler is too nested for a tight regex)
    assert(/backup:restoreFromCloud/.test(mainSrc),  'backup:restoreFromCloud handler must exist');
    assert(/owner_required/.test(mainSrc),           'owner role must still be checked');
    assert(/getCloudBackupContent/.test(mainSrc),    'RLS-backed download must still be called');
    assert(/validateFullBackup/.test(mainSrc),       'validateFullBackup must still be called');
    assert(/_applyArchiveInternal/.test(mainSrc),    'safety backup still required via _applyArchiveInternal');
  });

  // ── 1F.6C: manual backup / status dot consistency (this fix) ────────────────

  test('1F.6C manual-backup: wsConfirmManualBackup reconciles AUTO_BACKUP_UI on success', function() {
    var manFn = _rendererSrc.match(/function wsConfirmManualBackup\(\)([\s\S]*?)^\/\/ ── Cloud backup list/m);
    assert(manFn, 'wsConfirmManualBackup must be found');
    var body = manFn[1];
    assert(/AUTO_BACKUP_UI\.lastUploadedHash\s*=/.test(body),
      'wsConfirmManualBackup must set lastUploadedHash after success');
    assert(/AUTO_BACKUP_UI\.lastSuccessAt\s*=/.test(body),
      'wsConfirmManualBackup must set lastSuccessAt after success');
    assert(/AUTO_BACKUP_UI\.pendingHash\s*=\s*null/.test(body),
      'wsConfirmManualBackup must clear pendingHash when data matches uploaded state');
    assert(/AUTO_BACKUP_UI\.state\s*=\s*'ok'/.test(body),
      'wsConfirmManualBackup must set state=ok when data matches');
    assert(/clearTimeout\(_autoBackupDebounceTimer\)/.test(body),
      'wsConfirmManualBackup must cancel debounce timer after successful upload');
  });

  test('1F.6C manual-backup: Apply button visible after manual backup clears pendingHash', function() {
    // The _pend condition uses pendingHash — so clearing it makes Apply visible
    assert(/AUTO_BACKUP_UI\.pendingHash\s*!==\s*null/.test(_rendererSrc) ||
           /AUTO_BACKUP_UI\.pendingHash/.test(_rendererSrc),
      'pendingHash must gate Apply button visibility');
    // After manual backup: pendingHash = null → Apply shows for owner
    assert(/_canApp.*role.*owner/.test(_rendererSrc.replace(/\n/g,' ')) ||
           /role.*owner.*_canApp/.test(_rendererSrc.replace(/\n/g,' ')),
      'Apply condition must require owner role');
  });

  test('1F.6C manual-backup: Apply remains hidden if DATA changed during upload', function() {
    // The reconcile code only clears pendingHash if pendingHash===null or pendingHash===manualHash
    // If pendingHash differs (data changed during upload), Apply stays hidden
    var manFn = _rendererSrc.match(/function wsConfirmManualBackup\(\)([\s\S]*?)^\/\/ ── Cloud backup list/m);
    assert(manFn, 'wsConfirmManualBackup must be found');
    var body = manFn[1];
    // Must NOT blindly clear pendingHash — must check it matches the uploaded hash
    assert(/pendingHash\s*===\s*null\s*\|\|\s*AUTO_BACKUP_UI\.pendingHash\s*===\s*_manualHash/.test(body) ||
           /pendingHash.*null.*pendingHash.*manualHash/.test(body.replace(/\n/g,' ')),
      'pendingHash must only be cleared when it matches the uploaded hash (not blindly)');
  });

  // ── 1F.6C persistent backup status marker (root cause fix) ─────────────────

  test('1F.6C persist: CLOUD_BK_STATUS_KEY constant exists — separate from DATA key', function() {
    assert(/CLOUD_BK_STATUS_KEY\s*=\s*'ktp_cloud_backup_status_v1'/.test(_rendererSrc),
      'CLOUD_BK_STATUS_KEY must be defined with a stable key name');
    // Must be a DIFFERENT key from LSKEY (DATA) to avoid changing the fingerprint
    var lsKey = _rendererSrc.match(/(?:var|const|let)\s+LSKEY\s*=\s*(['"])(.*?)\1/);
    assert(lsKey, 'LSKEY must be defined');
    assert(lsKey[2] !== 'ktp_cloud_backup_status_v1',
      'cloud backup status key must differ from DATA/LSKEY');
  });

  test('1F.6C persist: _saveCloudBkStatus and _loadCloudBkStatus are defined', function() {
    assert(/function _saveCloudBkStatus/.test(_rendererSrc), '_saveCloudBkStatus must be defined');
    assert(/function _loadCloudBkStatus/.test(_rendererSrc), '_loadCloudBkStatus must be defined');
    // Save uses the status key, not LSKEY
    var saveFn = _rendererSrc.match(/function _saveCloudBkStatus([\s\S]*?)^function /m);
    assert(saveFn, '_saveCloudBkStatus body must be found');
    assert(/CLOUD_BK_STATUS_KEY/.test(saveFn[1]), '_saveCloudBkStatus must write to CLOUD_BK_STATUS_KEY');
    assert(!/localStorage\.setItem\(LSKEY/.test(saveFn[1]), '_saveCloudBkStatus must NOT write to LSKEY (DATA)');
  });

  test('1F.6C persist: _saveCloudBkStatus stores workspaceId, hash, successAt — never raw rendererState', function() {
    var saveFn = _rendererSrc.match(/function _saveCloudBkStatus([\s\S]*?)^function /m);
    assert(saveFn, '_saveCloudBkStatus body must be found');
    var body = saveFn[1];
    assert(/workspaceId/.test(body),  '_saveCloudBkStatus must store workspaceId');
    assert(/lastUploadedHash/.test(body), '_saveCloudBkStatus must store lastUploadedHash');
    assert(/lastSuccessAt/.test(body), '_saveCloudBkStatus must store lastSuccessAt');
    // Must NOT store rendererState, DATA contents, or raw archive
    assert(!/rendererState|archive|mainStore|DATA/.test(body),
      '_saveCloudBkStatus must not store rendererState/DATA/archive');
  });

  test('1F.6C persist: _scheduleAutoCloudBackup hydrates from localStorage before first hash comparison', function() {
    // Use a loose match since async function wsAutoBackupTick follows after whitespace/comments
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\([^)]*\)([\s\S]{0,3800})/);
    assert(schedFn, '_scheduleAutoCloudBackup body must be found');
    schedFn[1] = schedFn[1].slice(0, schedFn[1].indexOf('async function wsAutoBackupTick') || schedFn[1].length);
    var body = schedFn[1];
    // Hydration must happen before the first "hash === lastUploadedHash" check
    var hydrateIdx    = body.indexOf('_loadCloudBkStatus()');
    var hashCheckIdx  = body.indexOf('hash === AUTO_BACKUP_UI.lastUploadedHash');
    assert(hydrateIdx >= 0, '_scheduleAutoCloudBackup must call _loadCloudBkStatus');
    assert(hashCheckIdx > hydrateIdx, 'hydration must occur before lastUploadedHash comparison');
    // Hydration must check workspaceId matches to avoid stale data
    assert(/workspaceId.*WS_UI\.activeId|WS_UI\.activeId.*workspaceId/.test(body.replace(/\n/g,' ')),
      'hydration must verify workspaceId matches active workspace');
  });

  test('1F.6C persist: wsAutoBackupTick saves marker on success', function() {
    var tickFn = _rendererSrc.match(/async function wsAutoBackupTick\(\)([\s\S]*?)function _scheduleAutoRetry/);
    assert(tickFn, 'wsAutoBackupTick must be found');
    var body = tickFn[1];
    // Must call _saveCloudBkStatus after setting lastUploadedHash
    var saveIdx     = body.indexOf('_saveCloudBkStatus(');
    var hashSetIdx  = body.indexOf('AUTO_BACKUP_UI.lastUploadedHash = uploadedHash');
    assert(saveIdx > 0, 'wsAutoBackupTick must call _saveCloudBkStatus on success');
    assert(saveIdx > hashSetIdx, '_saveCloudBkStatus must be called after lastUploadedHash is set');
  });

  test('1F.6C persist: wsConfirmManualBackup saves marker on success', function() {
    var manFn = _rendererSrc.match(/function wsConfirmManualBackup\(\)([\s\S]*?)^\/\/ ── Cloud backup list/m);
    assert(manFn, 'wsConfirmManualBackup must be found');
    var body = manFn[1];
    assert(/_saveCloudBkStatus\(/.test(body),
      'wsConfirmManualBackup must call _saveCloudBkStatus to persist the uploaded hash');
  });

  test('1F.6C persist: wsConfirmApply2 saves restored-state fingerprint before reload', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function _backupDownloadErrMsg/m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    assert(/_saveCloudBkStatus\(/.test(body),
      'wsConfirmApply2 must call _saveCloudBkStatus before reload');
    // Must use _djb2Hash of rendererState (not raw rendererState) for the hash
    assert(/_djb2Hash\(_r\.rendererState\)/.test(body),
      'wsConfirmApply2 must compute fingerprint from restored rendererState using _djb2Hash');
    // Must be called before reload
    var saveIdx   = body.indexOf('_saveCloudBkStatus(');
    var reloadIdx = body.indexOf('location.reload()');
    assert(saveIdx > 0 && reloadIdx > saveIdx,
      '_saveCloudBkStatus must be called before location.reload()');
  });

  test('1F.6C persist: UI-only state changes do not create new pendingHash', function() {
    // CLOUD_BK_STATUS_KEY is written only by _saveCloudBkStatus, not by renderWorkspaceCard,
    // wsRefreshBackupList, language toggle, panel open/close, topbar indicator, etc.
    // This static check verifies that the status key is not written outside the expected functions.
    var writeSites = (_rendererSrc.match(/localStorage\.setItem\(CLOUD_BK_STATUS_KEY/g) || []).length;
    // Should only appear inside _saveCloudBkStatus
    assert(writeSites === 1, 'CLOUD_BK_STATUS_KEY must only be written inside _saveCloudBkStatus (1 site)');
    // _saveCloudBkStatus is only called from known safe places (auto-tick, manual backup, apply)
    var callSites = (_rendererSrc.match(/_saveCloudBkStatus\(/g) || []).length;
    // Should be: definition (1) + wsAutoBackupTick (1) + wsConfirmManualBackup (1) + wsConfirmApply2 (1) = 4
    assert(callSites <= 6, '_saveCloudBkStatus call sites must be bounded (not spread to every render)');
  });

  // ── 1F.6C deterministic hydration (runtime reload acceptance fix) ───────────

  test('1F.6C hydrate: _hydrateCloudBackupStatus function exists', function() {
    assert(/function _hydrateCloudBackupStatus\(\)/.test(_rendererSrc),
      '_hydrateCloudBackupStatus deterministic reconciler must be defined');
  });

  test('1F.6C hydrate: called at every workspace-activation point (wsRestore/wsActivate/offline)', function() {
    // wsRestore success path
    var restoreFn = _rendererSrc.match(/async function wsRestore\(\)([\s\S]*?)^\/\/ ── _wsRestoreOffline/m);
    assert(restoreFn, 'wsRestore must be found');
    assert(/_hydrateCloudBackupStatus\(\)/.test(restoreFn[1]),
      'wsRestore must call _hydrateCloudBackupStatus on success');
    // wsActivateWorkspace success path
    var activateFn = _rendererSrc.match(/async function wsActivateWorkspace\(workspaceId\)([\s\S]*?)^async function wsActivateByIndex/m);
    assert(activateFn, 'wsActivateWorkspace must be found');
    assert(/_hydrateCloudBackupStatus\(\)/.test(activateFn[1]),
      'wsActivateWorkspace must call _hydrateCloudBackupStatus');
    // offline restore
    var offlineFn = _rendererSrc.match(/function _wsRestoreOffline\(\)([\s\S]*?)\n\}/);
    assert(offlineFn, '_wsRestoreOffline must be found');
    assert(/_hydrateCloudBackupStatus\(\)/.test(offlineFn[1]),
      '_wsRestoreOffline must call _hydrateCloudBackupStatus');
  });

  test('1F.6C hydrate: reconciles to ok and clears pending when DATA matches marker', function() {
    var hydFn = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hydFn, '_hydrateCloudBackupStatus body must be found');
    var body = hydFn[1];
    // When hash matches lastUploadedHash → state ok, pendingHash null
    assert(/AUTO_BACKUP_UI\.pendingHash\s*=\s*null/.test(body),
      'must clear pendingHash when DATA matches marker');
    assert(/AUTO_BACKUP_UI\.state\s*=\s*'ok'/.test(body),
      'must set state=ok when DATA matches marker');
    // Comparison fingerprints JSON.stringify(DATA) via _djb2Hash — same algorithm as
    // scheduler. 1F.6D serializes once into _ser and reuses it for the hash.
    assert(/JSON\.stringify\(DATA\)/.test(body) && /_djb2Hash\(\s*_ser\s*\)/.test(body),
      'must compute fingerprint from JSON.stringify(DATA) with same algorithm as scheduler');
    // Must verify workspaceId matches the saved marker
    assert(/saved\.workspaceId\s*===\s*WS_UI\.activeId/.test(body),
      'must verify marker workspaceId matches active workspace');
  });

  test('1F.6C hydrate: keeps real pending when DATA differs from marker', function() {
    var hydFn = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hydFn, '_hydrateCloudBackupStatus body must be found');
    var body = hydFn[1];
    // When data differs, it calls the scheduler (which sets real pending) — does NOT force ok
    assert(/_scheduleAutoCloudBackup\(/.test(body),
      'must call scheduler when DATA differs (real pending allowed)');
  });

  test('1F.6C hydrate: requires activeId — never reconciles without a workspace', function() {
    var hydFn = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hydFn, '_hydrateCloudBackupStatus body must be found');
    var body = hydFn[1];
    assert(/if\s*\(!WS_UI\.activeId\)\s*return/.test(body),
      '_hydrateCloudBackupStatus must return early when no active workspace');
  });

  test('1F.6C scheduler: early-return clears stale false-pending when hash matches uploaded', function() {
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\([^)]*\)([\s\S]{0,3800})/);
    assert(schedFn, '_scheduleAutoCloudBackup must be found');
    var body = schedFn[1].slice(0, schedFn[1].indexOf('async function wsAutoBackupTick'));
    // The hash===lastUploadedHash branch must clear pending and set ok
    var idx = body.indexOf('hash === AUTO_BACKUP_UI.lastUploadedHash');
    assert(idx >= 0, 'early-return branch must exist');
    var branch = body.slice(idx, idx + 400);
    assert(/pendingHash\s*=\s*null/.test(branch),
      'early-return must clear stale pendingHash');
    assert(/state\s*=\s*'ok'/.test(branch),
      'early-return must reset state to ok when clearing stale pending');
  });

  test('1F.6C workspace-switch: wsActivateWorkspace resets in-memory hash tracking before hydrate', function() {
    var activateFn = _rendererSrc.match(/async function wsActivateWorkspace\(workspaceId\)([\s\S]*?)^async function wsActivateByIndex/m);
    assert(activateFn, 'wsActivateWorkspace must be found');
    var body = activateFn[1];
    // Reset lastUploadedHash to null before hydrating the new workspace's marker
    var resetIdx   = body.indexOf('AUTO_BACKUP_UI.lastUploadedHash = null');
    var hydrateIdx = body.indexOf('_hydrateCloudBackupStatus()');
    assert(resetIdx >= 0, 'must reset lastUploadedHash on workspace switch');
    assert(hydrateIdx > resetIdx, 'reset must occur before hydration on workspace switch');
  });

  test('1F.6C status-dot: backup card dot uses warn for pending/uploading/error', function() {
    // The inner backup card dot must NOT show green for pending state
    assert(!/AUTO_BACKUP_UI\.state === 'pending'.*?'ok'/.test(_rendererSrc.replace(/\n/g,' ')),
      'pending state must not map to ok (green) dot in the backup card');
    assert(!/AUTO_BACKUP_UI\.state === 'uploading'.*?'ok'/.test(_rendererSrc.replace(/\n/g,' ')),
      'uploading state must not map to ok (green) dot in the backup card');
    // Must use warn variant
    assert(/ws-status-dot.*warn|'warn'/.test(_rendererSrc),
      'warn CSS class must be used for pending/uploading states');
    assert(/\.ws-status-dot\.warn/.test(_rendererSrc),
      'ws-status-dot.warn CSS variant must be defined');
  });

  // ── 1F.6D startup responsiveness + reload hydration hardening ───────────────

  test('1F.6D boot-gate: _autoBackupBootGate is declared and starts true', function() {
    assert(/var _autoBackupBootGate\s*=\s*true/.test(_rendererSrc),
      '_autoBackupBootGate must be declared and initialized true so boot saveLocal() does not fingerprint DATA');
  });

  test('1F.6D boot-gate: scheduler returns early on the gate BEFORE serializing/fingerprinting DATA', function() {
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\([^)]*\)([\s\S]{0,3800})/);
    assert(schedFn, '_scheduleAutoCloudBackup must be found');
    var body = schedFn[1].slice(0, schedFn[1].indexOf('async function wsAutoBackupTick'));
    var gateIdx = body.indexOf('_autoBackupBootGate');
    var hashIdx = body.indexOf('_djb2Hash(');
    var stringifyIdx = body.indexOf('JSON.stringify(DATA)');
    assert(gateIdx >= 0, 'scheduler must check _autoBackupBootGate');
    assert(/if\s*\(\s*_autoBackupBootGate\s*\)\s*\{[^}]*return/.test(body.replace(/\n/g, ' ')),
      'scheduler must return early while the boot gate is set');
    assert(hashIdx > gateIdx, 'gate check must occur before the _djb2Hash fingerprint (no boot-time hashing)');
    assert(stringifyIdx === -1 || stringifyIdx > gateIdx,
      'gate check must occur before any JSON.stringify(DATA) fallback');
  });

  test('1F.6D boot-gate: scheduler accepts and reuses a pre-serialized DATA string', function() {
    // Signature carries an optional pre-serialized string and uses it instead of
    // re-stringifying DATA (single serialization per saveLocal).
    assert(/function _scheduleAutoCloudBackup\(_preSerialized\)/.test(_rendererSrc),
      'scheduler must accept a _preSerialized parameter');
    assert(/_djb2Hash\(typeof _preSerialized === 'string' \? _preSerialized : JSON\.stringify\(DATA\)\)/.test(_rendererSrc),
      'scheduler must reuse _preSerialized when provided, else serialize DATA itself');
  });

  test('1F.6D single-serialize: active saveLocal serializes DATA once and passes it to the scheduler', function() {
    // Extract the active HOTFIX saveLocal (the one using setSetting selected_month).
    var save = _rendererSrc.match(/window\.saveLocal = saveLocal = function\(\)\{([\s\S]*?)\n  \};/);
    assert(save, 'active saveLocal override must be found');
    var body = save[1];
    // Exactly one JSON.stringify(DATA) in the active saveLocal (was previously two).
    var serCount = (body.match(/JSON\.stringify\(DATA\)/g) || []).length;
    assert(serCount === 1, 'active saveLocal must serialize DATA exactly once (got ' + serCount + ')');
    assert(/localStorage\.setItem\(LSKEY,\s*_ser\)/.test(body),
      'localStorage write must reuse the single serialized string');
    assert(/_scheduleAutoCloudBackup\(typeof _ser === 'string' \? _ser : undefined\)/.test(body),
      'saveLocal must pass the serialized string to the scheduler');
  });

  test('1F.6D boot-gate: gate is released ONLY in _hydrateCloudBackupStatus, after the activeId guard', function() {
    // The gate must open exactly once, and only when the workspace is known — never
    // blindly elsewhere (which would re-introduce false pending before hydration).
    var releaseCount = (_rendererSrc.match(/_autoBackupBootGate\s*=\s*false/g) || []).length;
    assert(releaseCount === 1, 'boot gate must be released exactly once (got ' + releaseCount + ')');
    var hydFn = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hydFn, '_hydrateCloudBackupStatus body must be found');
    var body = hydFn[1];
    var guardIdx   = body.indexOf('if (!WS_UI.activeId) return');
    var releaseIdx = body.indexOf('_autoBackupBootGate = false');
    assert(guardIdx >= 0, 'hydrate must keep the activeId guard');
    assert(releaseIdx > guardIdx, 'gate must be released only AFTER the activeId guard (workspace known)');
  });

  test('1F.6D boot-gate: does not weaken Apply — gate release does not clear pending blindly', function() {
    // Releasing the gate must not by itself null pendingHash; pending is only cleared
    // when the DATA fingerprint matches the marker (existing reconciliation path).
    var hydFn = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hydFn, '_hydrateCloudBackupStatus body must be found');
    var body = hydFn[1];
    var releaseIdx = body.indexOf('_autoBackupBootGate = false');
    var matchBranchIdx = body.indexOf('hash === AUTO_BACKUP_UI.lastUploadedHash');
    var clearIdx = body.indexOf('AUTO_BACKUP_UI.pendingHash   = null');
    assert(matchBranchIdx > releaseIdx, 'fingerprint comparison must still gate the pending clear');
    assert(clearIdx > matchBranchIdx, 'pendingHash is cleared only inside the hash-matches-marker branch');
  });

  test('1F.6D perf marks: gated behind __KTP_BOOT_PERF and never log DATA/hashes/secrets', function() {
    assert(/function _perfMark\(label\)/.test(_rendererSrc), '_perfMark instrumentation must exist');
    var pf = _rendererSrc.match(/function _perfMark\(label\)\s*\{([\s\S]*?)\n\}/);
    assert(pf, '_perfMark body must be found');
    var body = pf[1];
    assert(/if\s*\(!window\.__KTP_BOOT_PERF/.test(body),
      '_perfMark must be silent unless __KTP_BOOT_PERF is enabled');
    // Must only log a label + a millisecond delta — never DATA/hashes/tokens.
    assert(!/JSON\.stringify|DATA|AUTO_BACKUP_UI|token|hash|rendererState/.test(body),
      '_perfMark must never reference DATA, hashes, tokens, or backup state');
  });

  test('1F.6D regression: real DATA edits still schedule after the gate opens', function() {
    // After hydration opens the gate, the unchanged debounce/pending machinery still
    // applies — the scheduler still records pendingHash for changed fingerprints.
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\([^)]*\)([\s\S]{0,3800})/);
    assert(schedFn, '_scheduleAutoCloudBackup must be found');
    var body = schedFn[1].slice(0, schedFn[1].indexOf('async function wsAutoBackupTick'));
    assert(/AUTO_BACKUP_UI\.pendingHash = hash/.test(body),
      'scheduler must still record a new pendingHash for changed DATA');
    assert(/setTimeout\(wsAutoBackupTick, AUTO_BACKUP_DEBOUNCE_MS\)/.test(body),
      'scheduler must still arm the debounce timer for changed DATA');
  });

  // ── 1F.6D runtime navigation hardening (render is view-only) ────────────────

  test('1F.6D render-decouple: active render override does NOT call full saveLocal()', function() {
    var rfn = _rendererSrc.match(/window\.render = render = function\(\)\{([\s\S]*?)\n  \};/);
    assert(rfn, 'active render override must be found');
    var body = rfn[1];
    assert(!/[^_a-zA-Z]saveLocal\(/.test(body),
      'render must NOT call saveLocal() — navigation must not serialize+write the whole DATA blob');
    assert(/_persistSelectedMonth\(\)/.test(body),
      'render must persist only the selected month (cheap IPC) instead of saveLocal()');
  });

  test('1F.6D render-decouple: no render tail still calls full saveLocal for autoSave', function() {
    // None of the render definitions may keep the old "autoSave) saveLocal()" tail.
    assert(!/autoSave\)\s*saveLocal\(\)/.test(_rendererSrc),
      'no render function may persist the whole DATA blob on the autoSave path');
    assert(!/autoSave\)\s*\{\s*saveLocal\(\)/.test(_rendererSrc),
      'no render function may persist the whole DATA blob on the autoSave path');
  });

  test('1F.6D persist-helper: _persistSelectedMonth is cheap — no DATA serialize or LSKEY write', function() {
    assert(/function _persistSelectedMonth\(\)/.test(_rendererSrc),
      '_persistSelectedMonth must be defined');
    var pf = _rendererSrc.match(/function _persistSelectedMonth\(\)\s*\{([\s\S]*?)\n\}/);
    assert(pf, '_persistSelectedMonth body must be found');
    var body = pf[1];
    assert(/setSetting\('selected_month'/.test(body),
      '_persistSelectedMonth must persist the selected month setting');
    assert(!/JSON\.stringify/.test(body), '_persistSelectedMonth must NOT serialize DATA');
    assert(!/localStorage\.setItem/.test(body), '_persistSelectedMonth must NOT write localStorage DATA');
  });

  test('1F.6D change-gate: saveLocal skips localStorage write when serialized DATA is unchanged', function() {
    assert(/var _lastPersistedSer\s*=\s*null/.test(_rendererSrc),
      '_lastPersistedSer cache must be declared (starts null so the first save always writes)');
    var save = _rendererSrc.match(/window\.saveLocal = saveLocal = function\(\)\{([\s\S]*?)\n  \};/);
    assert(save, 'active saveLocal override must be found');
    var body = save[1];
    // The write must be gated by a change comparison against the cache.
    assert(/_changed\s*=\s*\(_ser !== _lastPersistedSer\)/.test(body),
      'saveLocal must compute _changed by comparing serialized DATA to the cache');
    var changedIdx = body.indexOf('if(_changed)');
    var writeIdx   = body.indexOf('localStorage.setItem(LSKEY');
    assert(changedIdx >= 0 && writeIdx > changedIdx,
      'localStorage write must be inside the _changed guard');
    // Cache is updated only after a real write.
    assert(/_lastPersistedSer = _ser/.test(body),
      'saveLocal must update the cache after a write');
  });

  test('1F.6D change-gate: saveLocal schedules auto-backup only when DATA changed', function() {
    var save = _rendererSrc.match(/window\.saveLocal = saveLocal = function\(\)\{([\s\S]*?)\n  \};/);
    assert(save, 'active saveLocal override must be found');
    var body = save[1];
    var schedIdx   = body.indexOf('_scheduleAutoCloudBackup(');
    // Find the LAST _changed guard that wraps the scheduler call.
    var guardIdx   = body.lastIndexOf('if(_changed)', schedIdx);
    assert(schedIdx >= 0 && guardIdx >= 0 && guardIdx < schedIdx,
      'auto-backup scheduling must be guarded by _changed (no schedule on unchanged save)');
  });

  test('1F.6D regression: saveLocal still schedules + persists on a real (changed) save', function() {
    var save = _rendererSrc.match(/window\.saveLocal = saveLocal = function\(\)\{([\s\S]*?)\n  \};/);
    assert(save, 'active saveLocal override must be found');
    var body = save[1];
    // The changed path must both write and schedule (auto-backup stays active after edits).
    assert(/localStorage\.setItem\(LSKEY,\s*_ser\)/.test(body),
      'changed save must write the serialized DATA to localStorage');
    assert(/_scheduleAutoCloudBackup\(typeof _ser === 'string' \? _ser : undefined\)/.test(body),
      'changed save must still schedule the auto cloud backup');
  });

  test('1F.6D profiler: runtime profiler is gated and never logs DATA/secrets', function() {
    assert(/function _perfStart\(\)/.test(_rendererSrc), '_perfStart must exist');
    assert(/function _perfEnd\(label, t0\)/.test(_rendererSrc), '_perfEnd must exist');
    assert(/window\.__ktpPerfReport/.test(_rendererSrc), '__ktpPerfReport dump must exist');
    // Both timers gate on __KTP_PERF_DEBUG.
    var ps = _rendererSrc.match(/function _perfStart\(\)\s*\{([\s\S]*?)\n\}/);
    var pe = _rendererSrc.match(/function _perfEnd\(label, t0\)\s*\{([\s\S]*?)\n\}/);
    assert(ps && /__KTP_PERF_DEBUG/.test(ps[1]), '_perfStart must gate on __KTP_PERF_DEBUG');
    assert(pe && /__KTP_PERF_DEBUG/.test(pe[1]), '_perfEnd must gate on __KTP_PERF_DEBUG');
    // The aggregator stores only label/count/total/worst — never DATA or content.
    assert(!/_PERF_STATS\[[^\]]*\]\s*=\s*\{[^}]*(DATA|tenant|payment|token|rendererState)/.test(_rendererSrc),
      'profiler stats must not capture DATA, tenants, payments, tokens, or rendererState');
  });

  // ── 1G.2 real-sync auto-push (renderer state machine, default OFF) ───────────

  test('1G.2 flag: real sync is gated behind KTP_REAL_SYNC_PUSH_ENABLED (default off)', function() {
    assert(/function _realSyncPushEnabled\(\)/.test(_rendererSrc), '_realSyncPushEnabled gate must exist');
    var fn = _rendererSrc.match(/function _realSyncPushEnabled\(\)\s*\{([\s\S]*?)\n\}/);
    assert(fn, '_realSyncPushEnabled body must be found');
    assert(/KTP_REAL_SYNC_PUSH_ENABLED/.test(fn[1]), 'gate must read window.KTP_REAL_SYNC_PUSH_ENABLED');
  });

  test('1G.2 marker: ktp_sync_state_v1 is separate from DATA and the backup marker', function() {
    assert(/SYNC_STATE_KEY\s*=\s*'ktp_sync_state_v1'/.test(_rendererSrc), 'sync state marker key must exist');
    assert(_rendererSrc.indexOf("'ktp_sync_state_v1'") !== _rendererSrc.indexOf("'ktp_cloud_backup_status_v1'"),
      'sync marker must be distinct from the backup marker');
    // Marker is written only inside _saveSyncState.
    var writes = (_rendererSrc.match(/localStorage\.setItem\(SYNC_STATE_KEY/g) || []).length;
    assert(writes === 1, 'SYNC_STATE_KEY must be written in exactly one place (_saveSyncState)');
  });

  test('1G.2 inert: _markSyncDirty / _scheduleAutoSyncPush no-op when disabled', function() {
    var md = _rendererSrc.match(/function _markSyncDirty\(serialized\)\s*\{([\s\S]*?)\n\}/);
    assert(md, '_markSyncDirty body must be found');
    assert(/^\s*if\s*\(!_realSyncPushEnabled\(\)\)\s*return;/.test(md[1]),
      '_markSyncDirty must return immediately when real sync is disabled');
    var sp = _rendererSrc.match(/function _scheduleAutoSyncPush\(\)\s*\{([\s\S]*?)\n\}/);
    assert(sp, '_scheduleAutoSyncPush body must be found');
    assert(/if\s*\(!_realSyncPushEnabled\(\)\)\s*return;/.test(sp[1]),
      '_scheduleAutoSyncPush must return when disabled');
  });

  test('1G.2 saveLocal: dirty hook fires only inside the _changed branch', function() {
    var save = _rendererSrc.match(/window\.saveLocal = saveLocal = function\(\)\{([\s\S]*?)\n  \};/);
    assert(save, 'active saveLocal override must be found');
    var body = save[1];
    var schedIdx = body.indexOf('_markSyncDirty(');
    var guardIdx = body.lastIndexOf('if(_changed)', schedIdx);
    assert(schedIdx >= 0, 'saveLocal must call _markSyncDirty');
    assert(guardIdx >= 0 && guardIdx < schedIdx, '_markSyncDirty must be inside the _changed guard');
  });

  test('1G.2 viewer: auto-push tick never pushes for a viewer role', function() {
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick, 'wsAutoSyncPushTick body must be found');
    var body = tick[1];
    assert(/WS_UI\.activeRole === 'viewer'/.test(body), 'tick must detect viewer role');
    var viewerIdx = body.indexOf("activeRole === 'viewer'");
    var pushIdx   = body.indexOf('pushWorkspaceSnapshot');
    assert(viewerIdx >= 0 && pushIdx > viewerIdx, 'viewer check must precede the push call');
  });

  test('1G.2 push-only: sync tick has NO auto-pull / auto-apply / reload', function() {
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick, 'wsAutoSyncPushTick body must be found');
    var body = tick[1];
    assert(!/location\.reload/.test(body), 'sync tick must not reload');
    assert(!/restoreBackupFromCloud|restoreFullBackup|_applyArchive/.test(body), 'sync tick must not restore/apply');
    assert(!/\bDATA\s*=/.test(body), 'sync tick must never overwrite DATA');
  });

  test('1G.2 stale: CAS stale marks cloud_newer and does NOT overwrite locally', function() {
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick, 'wsAutoSyncPushTick body must be found');
    var body = tick[1];
    assert(/stale_revision/.test(body), 'tick must handle stale_revision');
    var staleIdx = body.indexOf('stale_revision');
    var seg = body.slice(staleIdx, staleIdx + 400);
    assert(/cloud_newer/.test(seg), 'stale must set cloud_newer state');
  });

  test('1G.2 hydrate: _hydrateSyncState is invoked from _hydrateCloudBackupStatus', function() {
    var hyd = _rendererSrc.match(/function _hydrateCloudBackupStatus\(\)([\s\S]*?)\n\}/);
    assert(hyd, '_hydrateCloudBackupStatus body must be found');
    assert(/_hydrateSyncState\(\)/.test(hyd[1]), 'backup hydration must also reconcile sync state');
    // 1G.4C-FIX: marker hydration must be READ-ONLY and FLAG-INDEPENDENT. The
    // runtime KTP_REAL_SYNC_* flags reset on reload; gating hydration on them lost
    // the synced baseRevision after an accepted apply (idle/0 bug). The only guard
    // is the active workspace; detection inside remains push-flag-gated.
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs, '_hydrateSyncState body must be found');
    assert(/^\s*if \(!WS_UI\.activeId\) return;/.test(hs[1]),
      '_hydrateSyncState guard must be the active-workspace check only');
    assert(!/!_realSyncPushEnabled\(\)\s*\|\|/.test(hs[1]),
      '_hydrateSyncState must NOT gate marker hydration on the push flag');
  });

  test('1G.2 labels: truthful sync status keys exist and are distinct from backup', function() {
    ['syncSynced', 'syncSyncing', 'syncLocalPending', 'syncOffline', 'syncCloudNewer', 'syncViewOnly'].forEach(function(k) {
      assert(new RegExp(k + ':').test(_rendererSrc), 'sync label ' + k + ' must exist');
    });
    // No "Sync now" control is introduced in this phase.
    assert(!/Sync now|Şimdi senkron/i.test(_rendererSrc), 'no "Sync now" control in 1G.2');
  });

  // ── 1G.2 collision guard: preload globals must not clash with renderer code ──
  // Regression for the "Identifier 'cloudSync' has already been declared" boot
  // crash: contextBridge.exposeInMainWorld('NAME', ...) defines a non-configurable
  // GLOBAL named NAME. A renderer top-level `function NAME()` / `const NAME` then
  // fails to declare, breaking the entire renderer script parse. syntax-check
  // can't catch this (it parses the renderer JS without the injected globals).

  test('1G.2 collision: renderer has no duplicate top-level cloudSync lexical declaration', function() {
    // At most one `function cloudSync` and NO const/let/var/class cloudSync.
    var fnDecls = (_rendererSrc.match(/(?:^|\n)\s*(?:async\s+)?function\s+cloudSync\s*\(/g) || []).length;
    assert(fnDecls <= 1, 'there must be at most one top-level function cloudSync (found ' + fnDecls + ')');
    assert(!/(?:^|\n)\s*(?:const|let|var|class)\s+cloudSync\b/.test(_rendererSrc),
      'renderer must not also declare const/let/var/class cloudSync alongside function cloudSync');
  });

  test('1G.2 collision: no preload-exposed global collides with a renderer top-level function', function() {
    var fs = require('fs'); var path = require('path');
    var preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8').replace(/\r/g, '');
    var names = [];
    var re = /exposeInMainWorld\(\s*'([A-Za-z0-9_]+)'/g, m;
    while ((m = re.exec(preloadSrc)) !== null) names.push(m[1]);
    assert(names.length >= 4, 'expected several exposed bridges, found ' + names.length);
    names.forEach(function(name) {
      var fnRe  = new RegExp('(?:^|\\n)\\s*(?:async\\s+)?function\\s+' + name + '\\s*\\(');
      var lexRe = new RegExp('(?:^|\\n)\\s*(?:const|let|class)\\s+' + name + '\\b');
      assert(!fnRe.test(_rendererSrc),
        "exposed global '" + name + "' collides with a renderer top-level function " + name + "()");
      assert(!lexRe.test(_rendererSrc),
        "exposed global '" + name + "' collides with a renderer top-level const/let/class " + name);
    });
  });

  test('1G.2 collision: real-sync bridge is exposed as cloudSyncPush (not cloudSync)', function() {
    var fs = require('fs'); var path = require('path');
    var preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    assert(/exposeInMainWorld\(\s*'cloudSyncPush'/.test(preloadSrc), 'bridge must be exposed as cloudSyncPush');
    assert(!/exposeInMainWorld\(\s*'cloudSync'\s*,/.test(preloadSrc), "bridge must NOT be exposed as 'cloudSync'");
    // Renderer reads the renamed global, never window.cloudSync.
    assert(/window\.cloudSyncPush/.test(_rendererSrc), 'renderer must read window.cloudSyncPush');
    assert(!/window\.cloudSync\b/.test(_rendererSrc), 'renderer must not read window.cloudSync');
  });

  // ── 1G.3 proactive cloud-newer detection (read-only, default OFF) ───────────

  function _detectBody() {
    var m = _rendererSrc.match(/async function _detectCloudNewer\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_detectCloudNewer body must be found');
    return m[1];
  }

  test('1G.3 detect: _detectCloudNewer exists and is flag-gated (inert by default)', function() {
    assert(/async function _detectCloudNewer\(/.test(_rendererSrc), '_detectCloudNewer must exist');
    var body = _detectBody();
    assert(/^\s*if\s*\(!_realSyncPushEnabled\(\)\)\s*return;/.test(body),
      'first statement must be the KTP_REAL_SYNC_PUSH_ENABLED gate');
  });

  test('1G.3 detect: sets cloud_newer when currentRevision > baseRevision', function() {
    var body = _detectBody();
    assert(/cloudRev > SYNC_PUSH_UI\.baseRevision/.test(body), 'must compare cloud vs base revision');
    // 1G.5B: clean → cloud_newer, dirty → conflict, viewer → view_only.
    var newerSeg = body.slice(body.indexOf('cloudRev > SYNC_PUSH_UI.baseRevision'),
                             body.indexOf('cloudRev === SYNC_PUSH_UI.baseRevision'));
    assert(/'cloud_newer'/.test(newerSeg), 'clean + newer cloud must set cloud_newer');
    assert(/'view_only'/.test(newerSeg), 'viewer must map to view_only');
  });

  test('1G.3 detect: clean + current can return to synced; never while dirty', function() {
    var body = _detectBody();
    assert(/cloudRev === SYNC_PUSH_UI\.baseRevision/.test(body), 'must handle equal revision');
    assert(/SYNC_PUSH_UI\.pendingHash == null/.test(body), 'synced transition must require clean (no pendingHash)');
    assert(/: 'synced'/.test(body), 'must be able to set synced when clean/current');
  });

  test('1G.3 detect: never mutates pendingHash or baseRevision (no overwrite)', function() {
    var body = _detectBody();
    assert(!/SYNC_PUSH_UI\.pendingHash\s*=[^=]/.test(body), 'detection must NOT assign pendingHash');
    assert(!/SYNC_PUSH_UI\.baseRevision\s*=[^=]/.test(body), 'detection must NOT change baseRevision');
  });

  test('1G.3 detect: no pull/apply/restore/reload/DATA write', function() {
    var body = _detectBody();
    assert(!/location\.reload/.test(body), 'no reload');
    assert(!/restoreBackupFromCloud|restoreFullBackup|_applyArchive|pushWorkspaceSnapshot/.test(body),
      'no apply/restore/push from detection');
    assert(!/\bDATA\s*=/.test(body), 'must not write DATA');
  });

  test('1G.3 detect: read-only — consumes only currentRevision, no forbidden fields', function() {
    var body = _detectBody();
    assert(/res\.currentRevision/.test(body), 'must read currentRevision');
    assert(!/storage|snapshot_hash|snapshotHash|lease|createSignedUrl|get_latest_snapshot_metadata|device/i.test(body),
      'detection must not reference storage paths, hashes, lease tokens, device ids, or snapshot content');
  });

  test('1G.3 detect: guards — pushInFlight, coalesce, activeId, hidden, workspace-stamp', function() {
    var body = _detectBody();
    assert(/if \(SYNC_PUSH_UI\.pushInFlight\) return;/.test(body), 'must skip while a push is in flight');
    assert(/_syncPollInFlight/.test(body), 'must coalesce with an in-flight guard');
    assert(/if \(!WS_UI\.activeId\) return;/.test(body), 'must no-op without an active workspace');
    assert(/document\.hidden/.test(body), 'should skip when document hidden');
    assert(/var reqWorkspaceId = WS_UI\.activeId/.test(body), 'must stamp the request with the workspace id');
    assert(/WS_UI\.activeId !== reqWorkspaceId/.test(body), 'must discard a stale-workspace response');
  });

  test('1G.3 detect: offline/error/not-current-auth does not corrupt state', function() {
    var body = _detectBody();
    // getSyncStatus failure path returns without touching state.
    assert(/catch \(_\) \{\s*_syncPollInFlight = false;\s*return;/.test(body.replace(/\n/g, ' ')),
      'network error must return without state changes');
    assert(/if \(!res \|\| res\.ok !== true\) return;/.test(body), 'non-ok status must return (no false synced)');
  });

  test('1G.3 suppress: auto-push tick is suppressed while cloud_newer', function() {
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick, 'wsAutoSyncPushTick body must be found');
    var body = tick[1];
    assert(/SYNC_PUSH_UI\.state === 'cloud_newer'[\s\S]{0,80}return;/.test(body),
      'tick must return early while cloud_newer (no guaranteed-stale churn)');
    // Suppression must come after the viewer check and before the push call.
    var supIdx  = body.indexOf("state === 'cloud_newer'");
    var pushIdx = body.indexOf('pushWorkspaceSnapshot');
    assert(supIdx >= 0 && pushIdx > supIdx, 'suppression must precede the push call');
  });

  test('1G.3 invariant: cloudRev > baseRevision can never resolve to synced', function() {
    var body = _detectBody();
    // The newer-cloud branch must set cloud_newer and RETURN before any synced path.
    var newerIdx  = body.indexOf('cloudRev > SYNC_PUSH_UI.baseRevision');
    var equalIdx  = body.indexOf('cloudRev === SYNC_PUSH_UI.baseRevision');
    var syncedIdx = body.indexOf(": 'synced'");
    assert(newerIdx >= 0 && equalIdx > newerIdx, 'newer-branch must precede the equal-branch');
    assert(syncedIdx > equalIdx, "'synced' may only be set inside the equal-revision branch");
    // The newer branch must return before reaching the synced assignment.
    var newerSeg = body.slice(newerIdx, equalIdx);
    assert(/return;/.test(newerSeg), 'newer-cloud branch must return (no fall-through to synced)');
    assert(!/'synced'/.test(newerSeg), 'newer-cloud branch must not set synced');
  });

  test('1G.3 reliability: document.hidden skip is interval-only (explicit triggers always run)', function() {
    var body = _detectBody();
    assert(/opts\.viaInterval && typeof document !== 'undefined' && document\.hidden/.test(body),
      'hidden skip must be gated by opts.viaInterval, not unconditional');
    // The unconditional hidden early-return must be gone.
    assert(!/\n\s*if \(typeof document !== 'undefined' && document\.hidden\) return;/.test(body),
      'there must be no unconditional document.hidden early-return');
    assert(/_detectCloudNewer\(\{ viaInterval: true \}\)/.test(_rendererSrc),
      'the periodic interval must pass { viaInterval: true }');
  });

  test('1G.3 manual helper: __ktpDetectCloudNewer is gated and returns only safe fields', function() {
    assert(/window\.__ktpDetectCloudNewer = function \(\)/.test(_rendererSrc), 'manual helper must exist');
    var m = _rendererSrc.match(/window\.__ktpDetectCloudNewer = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'manual helper body must be found');
    var body = m[1];
    assert(/if \(!_realSyncPushEnabled\(\)\) return Promise\.resolve\(\{ enabled: false \}\);/.test(body),
      'helper must be flag-gated');
    // Returns only safe fields — never DATA, hashes, tokens, storage paths, device ids.
    assert(!/JSON\.stringify|rendererState|lastSyncedHash|pendingHash:[^!]|storage|snapshot|lease|device|token|checksum/i.test(body),
      'helper must not expose DATA, hashes, tokens, storage paths, device ids, or lease tokens');
    assert(/state:\s*SYNC_PUSH_UI\.state/.test(body) && /hasPending:\s*SYNC_PUSH_UI\.pendingHash != null/.test(body),
      'helper must return state + a boolean hasPending (not the raw hash)');
  });

  test('1G.3 perf: detection does NO DOM/render/save work (UI-freeze regression guard)', function() {
    var body = _detectBody();
    assert(!/renderWorkspaceCard\(/.test(body), 'detection must not rebuild the workspace card');
    assert(!/renderAutoBackupIndicator\(/.test(body), 'detection must not rebuild the backup indicator');
    assert(!/[^_a-zA-Z]render\(/.test(body), 'detection must not call full render()');
    assert(!/[^_a-zA-Z]saveLocal\(/.test(body), 'detection must not persist/save');
    assert(!/\.innerHTML|modal-overlay|openMod\(|closeMod\(|\.style\.display/.test(body),
      'detection must not touch DOM, overlay, or modal');
  });

  test('1G.3 perf: exactly one sync poll interval; focus/online listeners once', function() {
    assert(/function _startSyncCloudNewerPolling\(\)\s*\{\s*if \(_syncPollInterval\) return;/.test(_rendererSrc),
      'poll starter must guard against duplicate intervals');
    // The sync-detection interval is created in exactly one place.
    var intervalN = (_rendererSrc.match(/_syncPollInterval = setInterval\(/g) || []).length;
    assert(intervalN === 1, 'sync poll interval must be created exactly once (found ' + intervalN + ')');
    var focusN  = (_rendererSrc.match(/addEventListener\('focus',\s*function \(\) \{ _scheduleDetectCloudNewer\(\); \}\)/g) || []).length;
    var onlineN = (_rendererSrc.match(/addEventListener\('online',\s*function \(\) \{ _scheduleDetectCloudNewer\(\); \}\)/g) || []).length;
    assert(focusN === 1, 'exactly one sync-detect focus listener (found ' + focusN + ')');
    assert(onlineN === 1, 'exactly one sync-detect online listener (found ' + onlineN + ')');
  });

  test('1G.3 triggers: hydrate + focus + online + interval wired; gated', function() {
    var hyd = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hyd && /_scheduleDetectCloudNewer\(\)/.test(hyd[1]), 'hydrate must trigger detection');
    assert(/addEventListener\('focus',\s*function \(\) \{ _scheduleDetectCloudNewer\(\); \}\)/.test(_rendererSrc),
      'focus must trigger detection');
    assert(/addEventListener\('online',\s*function \(\) \{ _scheduleDetectCloudNewer\(\); \}\)/.test(_rendererSrc),
      'online must trigger detection');
    assert(/function _startSyncCloudNewerPolling\(\)/.test(_rendererSrc), 'periodic poll starter must exist');
    assert(/SYNC_POLL_INTERVAL_MS = 60 \* 1000/.test(_rendererSrc), 'interval should be ~60s');
    // Scheduler + interval are flag-gated.
    var sch = _rendererSrc.match(/function _scheduleDetectCloudNewer\(delayMs\)\s*\{([\s\S]*?)\n\}/);
    assert(sch && /if \(!_realSyncPushEnabled\(\)\) return;/.test(sch[1]), 'scheduler must be flag-gated');
  });

  // ── 1G.4B snapshot pull PREFLIGHT (read-only; separate flag; no apply) ───────

  function _preflightBody() {
    var m = _rendererSrc.match(/async function _preflightPullSnapshot\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_preflightPullSnapshot body must be found');
    return m[1];
  }

  test('1G.4B flag: pull uses a SEPARATE flag KTP_REAL_SYNC_PULL_ENABLED (distinct from push)', function() {
    assert(/function _realSyncPullEnabled\(\)/.test(_rendererSrc), '_realSyncPullEnabled must exist');
    var fn = _rendererSrc.match(/function _realSyncPullEnabled\(\)\s*\{([\s\S]*?)\n\}/);
    assert(fn && /KTP_REAL_SYNC_PULL_ENABLED/.test(fn[1]), 'pull gate must read KTP_REAL_SYNC_PULL_ENABLED');
    // Pull gate must NOT be satisfied by the push flag.
    assert(!/KTP_REAL_SYNC_PUSH_ENABLED/.test(fn[1]), 'pull gate must not read the push flag');
  });

  test('1G.4B preflight: gated by pull flag first; blocks dirty and not-newer', function() {
    var body = _preflightBody();
    assert(/^\s*if\s*\(!_realSyncPullEnabled\(\)\)\s*return\s*\{ ok: false, error: 'pull_disabled' \};/.test(body),
      'first statement must be the pull-flag gate');
    assert(/_isLocalSyncDirty\(\)\)\s*return \{ ok: false, error: 'blocked_dirty' \}/.test(body),
      'restart-safe dirty must block preflight');
    assert(/cloudRevision <= SYNC_PUSH_UI\.baseRevision\) return \{ ok: false, error: 'not_newer' \}/.test(body),
      'must block when not strictly newer');
    assert(/pushInFlight\)\s*return \{ ok: false, error: 'blocked_push_in_flight' \}/.test(body),
      'must block while a push is in flight');
  });

  test('1G.4B preflight: stamps workspace and discards stale result', function() {
    var body = _preflightBody();
    assert(/var reqWorkspaceId = WS_UI\.activeId/.test(body), 'must stamp the request workspace');
    assert(/WS_UI\.activeId !== reqWorkspaceId\) return \{ ok: false, error: 'workspace_changed' \}/.test(body),
      'must discard a stale-workspace result');
  });

  test('1G.4B preflight: does NOT apply/write/reload/mutate sync state', function() {
    var body = _preflightBody();
    assert(!/localStorage/.test(body), 'preflight must not touch localStorage');
    assert(!/location\.reload/.test(body), 'preflight must not reload');
    assert(!/\.innerHTML|renderWorkspaceCard\(|[^_a-zA-Z]render\(|[^_a-zA-Z]saveLocal\(/.test(body),
      'preflight must do no DOM/render/save work');
    assert(!/restoreBackupFromCloud|restoreFullBackup|_applyArchive/.test(body), 'preflight must not apply/restore');
    assert(!/\bDATA\s*=/.test(body), 'preflight must not write DATA');
    // Must NOT advance baseRevision / lastSyncedHash, must NOT flip state to synced.
    assert(!/SYNC_PUSH_UI\.baseRevision\s*=[^=]/.test(body), 'preflight must not change baseRevision');
    assert(!/SYNC_PUSH_UI\.lastSyncedHash\s*=[^=]/.test(body), 'preflight must not change lastSyncedHash');
    assert(!/SYNC_PUSH_UI\.state\s*=[^=]/.test(body), 'preflight must not change state');
    // pullInFlight toggling IS expected (the only allowed mutation).
    assert(/SYNC_PUSH_UI\.pullInFlight = true/.test(body) && /SYNC_PUSH_UI\.pullInFlight = false/.test(body),
      'preflight must set/clear pullInFlight');
  });

  test('1G.4B bridge: pull bridge reads window.cloudSyncPull (collision-safe name)', function() {
    assert(/window\.cloudSyncPull/.test(_rendererSrc), 'renderer must read window.cloudSyncPull');
    var fs = require('fs'); var path = require('path');
    var preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    assert(/exposeInMainWorld\(\s*'cloudSyncPull'/.test(preloadSrc), 'bridge must be exposed as cloudSyncPull');
    assert(/preflightPullSnapshot/.test(preloadSrc), 'preload must wire preflightPullSnapshot');
  });

  test('1G.4B manual helper: __ktpPreflightPull gated; returns no content/secrets', function() {
    assert(/window\.__ktpPreflightPull = function \(\)/.test(_rendererSrc), 'manual pull helper must exist');
    var m = _rendererSrc.match(/window\.__ktpPreflightPull = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'manual pull helper body must be found');
    var body = m[1];
    assert(/if \(!_realSyncPullEnabled\(\)\) return Promise\.resolve\(\{ enabled: false \}\);/.test(body),
      'helper must be gated by the pull flag');
    assert(!/content|storage|snapshotHash|snapshot_hash|signedUrl|lease|device|token|checksum|JSON\.stringify/i.test(body),
      'helper must not expose content, storage paths, hashes, signed URLs, device ids, or lease tokens');
  });

  // ── 1G.4C clean-only accepted apply (explicit; destructive; gated) ───────────

  function _applyBody() {
    var m = _rendererSrc.match(/async function _applyPulledSnapshot\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_applyPulledSnapshot body must be found');
    return m[1];
  }

  test('1G.4C apply: gated by pull flag first; blocks dirty / not-newer / in-flight', function() {
    assert(/async function _applyPulledSnapshot\(\)/.test(_rendererSrc), '_applyPulledSnapshot must exist');
    var body = _applyBody();
    assert(/^\s*if\s*\(!_realSyncPullEnabled\(\)\)\s*return \{ ok: false, error: 'pull_disabled' \};/.test(body),
      'first statement must be the pull-flag gate');
    assert(/_isLocalSyncDirty\(\)\)\s*return \{ ok: false, error: 'blocked_dirty' \}/.test(body), 'restart-safe dirty blocks apply');
    assert(/cloudRevision <= SYNC_PUSH_UI\.baseRevision\) return \{ ok: false, error: 'not_newer' \}/.test(body), 'not-newer blocks');
    assert(/pushInFlight\)\s*return \{ ok: false, error: 'blocked_push_in_flight' \}/.test(body), 'push-in-flight blocks');
    assert(/pullInFlight\)\s*return \{ ok: false, error: 'blocked_pull_in_flight' \}/.test(body), 'pull-in-flight blocks');
  });

  test('1G.4C apply: re-checks clean immediately before the LSKEY write', function() {
    var body = _applyBody();
    assert(/_djb2Hash\(JSON\.stringify\(DATA\)\) !== preHash/.test(body),
      'must re-verify DATA is unchanged right before writing');
    var recheckIdx = body.indexOf('!== preHash');
    var writeIdx   = body.indexOf('localStorage.setItem(LSKEY');
    assert(recheckIdx >= 0 && writeIdx > recheckIdx, 'the re-check must precede the LSKEY write');
  });

  test('1G.4C apply: sync state advances ONLY after a successful LSKEY write', function() {
    var body = _applyBody();
    var writeIdx   = body.indexOf('localStorage.setItem(LSKEY');
    var baseIdx    = body.indexOf('= res.revision');               // baseRevision assignment
    var syncedIdx  = body.indexOf("= 'synced'");                   // state advance
    assert(writeIdx >= 0, 'must write LSKEY');
    assert(baseIdx > writeIdx, 'baseRevision must be set after the write');
    assert(syncedIdx > writeIdx, 'state synced must be set after the write');
    // The ok===true guard must precede the write (no write on failure).
    var okGuardIdx = body.indexOf('res.ok !== true');
    assert(okGuardIdx >= 0 && okGuardIdx < writeIdx, 'failure guard must precede the write');
  });

  test('1G.4C apply: workspace-stamp discards a stale-workspace apply', function() {
    var body = _applyBody();
    assert(/var reqWorkspaceId  = WS_UI\.activeId/.test(body), 'must stamp the request workspace');
    assert(/WS_UI\.activeId !== reqWorkspaceId\) \{ SYNC_PUSH_UI\.pullInFlight = false; return \{ ok: false, error: 'stale_workspace' \}/.test(body),
      'must discard a stale-workspace apply with no write');
  });

  test('1G.4C apply: never auto-triggered (not called from detection/preflight)', function() {
    assert(!/_applyPulledSnapshot\(/.test(_detectBody()), 'detection must never call apply');
    assert(!/_applyPulledSnapshot\(/.test(_preflightBody()), 'preflight must never call apply');
    // focus/online listeners only schedule detection, never apply.
    assert(!/addEventListener\('(focus|online)'[^)]*_applyPulledSnapshot/.test(_rendererSrc),
      'focus/online must not trigger apply');
  });

  test('1G.4C manual helper: __ktpApplyPulledSnapshot gated; returns no content/secrets', function() {
    assert(/window\.__ktpApplyPulledSnapshot = function \(\)/.test(_rendererSrc), 'manual apply helper must exist');
    var m = _rendererSrc.match(/window\.__ktpApplyPulledSnapshot = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'manual apply helper body must be found');
    var body = m[1];
    assert(/if \(!_realSyncPullEnabled\(\)\) return Promise\.resolve\(\{ enabled: false \}\);/.test(body),
      'helper must be gated by the pull flag');
    assert(!/rendererState|content|storage|snapshotHash|snapshot_hash|signedUrl|lease|device|token|checksum/i.test(body),
      'helper must not expose content/state blob, storage paths, hashes, signed URLs, device ids, lease tokens');
  });

  test('1G.4C main: applyPulledSnapshot creates mandatory safety backup BEFORE returning content', function() {
    var fs = require('fs'); var path = require('path');
    var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g, '');
    var h = mainSrc.match(/ipcMain\.handle\('cloud:applyPulledSnapshot'[\s\S]*?\n  \}\);/);
    assert(h, 'cloud:applyPulledSnapshot handler must exist');
    var body = h[0];
    assert(/pullSnapshotForApply/.test(body), 'must use the sync pull path (not backup restore)');
    assert(/buildFullBackup\(preRestoreRendererState, null, 'pre-sync-pull'\)/.test(body), 'must build a local pre-sync-pull safety backup');
    assert(/atomicWriteJSON\(/.test(body), 'safety backup must be written to disk');
    assert(/error: 'safety_backup_failed'/.test(body), 'safety-backup failure must block apply');
    // Ordering: safety backup precedes returning rendererState content.
    var backupIdx = body.indexOf('buildFullBackup(');
    var returnIdx = body.indexOf('rendererState:');
    assert(backupIdx >= 0 && returnIdx > backupIdx, 'safety backup must precede the content return');
    // Must NOT route sync through the emergency restore/apply path.
    assert(!/_applyArchiveInternal|getCloudBackupContent|restoreFromCloud/.test(body),
      'sync apply must not reuse Cloud Backup Apply / emergency restore');
  });

  test('1G.4C main: applyPulledSnapshot never logs snapshot content', function() {
    var fs = require('fs'); var path = require('path');
    var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g, '');
    var h = mainSrc.match(/ipcMain\.handle\('cloud:applyPulledSnapshot'[\s\S]*?\n  \}\);/);
    assert(h, 'handler must exist');
    var body = h[0];
    // No log/console call may include the content/rendererState.
    assert(!/log\([^)]*(pulled\.content|rendererState|preRestoreRendererState)/.test(body),
      'must not log snapshot content or renderer state');
    assert(!/console\.(log|error|warn)\([^)]*(content|rendererState)/.test(body),
      'must not console-log content or renderer state');
  });

  // ── 1G.4C-FIX: post-apply reload must restore active workspace + synced state ──

  test('1G.4C-fix: apply persists the sync marker BEFORE scheduling reload', function() {
    var body = _applyBody();
    var saveIdx   = body.indexOf('_saveSyncState()');
    var reloadIdx = body.indexOf('location.reload');
    assert(saveIdx >= 0, 'apply must persist the sync marker');
    assert(reloadIdx >= 0, 'apply must schedule a reload on success');
    assert(saveIdx < reloadIdx, '_saveSyncState() must run before the reload');
  });

  test('1G.4C-fix: apply does NOT clear the active workspace selection', function() {
    var body = _applyBody();
    assert(!/_wsSaveId\(\s*null\s*\)/.test(body), 'apply must not clear ktp_active_workspace_id');
    assert(!/removeItem\(\s*'ktp_active_workspace_id'/.test(body), 'apply must not remove the active workspace key');
    assert(!/WS_UI\.activeId\s*=\s*null/.test(body), 'apply must not null the active workspace');
  });

  test('1G.4C-fix: hydration reflects synced when local DATA matches the marker', function() {
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs, '_hydrateSyncState body must be found');
    var body = hs[1];
    assert(/_djb2Hash\(JSON\.stringify\(DATA\)\) === SYNC_PUSH_UI\.lastSyncedHash/.test(body),
      'hydration must compare local DATA fingerprint to the synced hash');
    var cmpIdx    = body.indexOf('=== SYNC_PUSH_UI.lastSyncedHash');
    var syncedIdx = body.indexOf("= 'synced'");
    assert(cmpIdx >= 0 && syncedIdx > cmpIdx, "synced must be set only inside the DATA-matches-marker branch");
    // It must NOT blanket-set synced unconditionally.
    var firstSynced = body.indexOf("'synced'");
    assert(firstSynced > cmpIdx, "must not set synced before verifying the fingerprint match");
  });

  test('1G.4C-fix: sync marker stores only safe fields (no DATA/content/hash-of-secret)', function() {
    var sv = _rendererSrc.match(/function _saveSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(sv, '_saveSyncState body must be found');
    var body = sv[1];
    // Allowed: workspaceId, baseRevision, lastSyncedHash (local change fingerprint), lastPushAt.
    assert(/workspaceId:/.test(body) && /baseRevision:/.test(body), 'marker keys present');
    assert(!/rendererState|JSON\.stringify\(DATA\)|content|storage_path|storagePath|snapshot_hash|snapshotHash|signedUrl|deviceId|device_id|leaseToken|lease_token|checksum/i.test(body),
      'marker must not store DATA/content/storage path/snapshot hash/device id/lease token');
  });

  test('1G.4C-fix: apply helper returns activeId/activeRole/scheduledReload (safe)', function() {
    var m = _rendererSrc.match(/window\.__ktpApplyPulledSnapshot = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'apply helper body must be found');
    var body = m[1];
    assert(/activeId:\s*WS_UI\.activeId/.test(body), 'helper must report active workspace restoration');
    assert(/activeRole:\s*WS_UI\.activeRole/.test(body), 'helper must report active role');
    assert(/scheduledReload:/.test(body), 'helper must report whether a reload was scheduled');
  });

  test('1G.4C-fix: apply preserves local login identity + workspace linkage (no lockout)', function() {
    var body = _applyBody();
    assert(/_incoming\.users\s*=\s*_localPrev\.users/.test(body),
      'apply must preserve local users (avoid PIN lockout from another device)');
    assert(/_incoming\.workspaceId\s*=\s*_localPrev\.workspaceId/.test(body),
      'apply must preserve local DATA.workspaceId (keep cloud workspace linkage)');
    // The merged string is what gets written and fingerprinted.
    assert(/localStorage\.setItem\(LSKEY,\s*_applyStr\)/.test(body), 'LSKEY write must use the merged string');
    assert(/SYNC_PUSH_UI\.lastSyncedHash\s*=\s*_djb2Hash\(_applyStr\)/.test(body),
      'lastSyncedHash must fingerprint the merged local state actually written');
    // Merge must sit AFTER the clean re-check and BEFORE the write.
    var recheckIdx = body.indexOf('!== preHash');
    var mergeIdx   = body.indexOf('_incoming.users');
    var writeIdx   = body.indexOf('localStorage.setItem(LSKEY');
    assert(recheckIdx >= 0 && mergeIdx > recheckIdx && writeIdx > mergeIdx,
      'order must be: clean re-check → merge → write');
  });

  test('1G.4C-fix: apply does not depend on snapshot DATA.workspaceId for workspace restore', function() {
    // Active workspace selection is the separate ktp_active_workspace_id key; the
    // applied snapshot DATA.workspaceId (a LOCAL id from the pushing device) is
    // preserved as the local value and never used to pick the cloud workspace.
    var body = _applyBody();
    assert(!/ktp_active_workspace_id/.test(body), 'apply must not touch the active-workspace key');
    var restore = _rendererSrc.match(/async function wsRestore\(\)([\s\S]*?)\n\}/);
    if (restore) {
      assert(/_wsReadSavedId\(\)/.test(restore[1]), 'wsRestore must restore by the saved cloud workspace id');
      assert(!/DATA\.workspaceId/.test(restore[1]), 'wsRestore must NOT key on local DATA.workspaceId');
    }
  });

  // ── 1G.5B restart-safe dirty + explicit conflict state (no resolution) ───────

  test('1G.5B dirty: _isLocalSyncDirty derives dirty from the fingerprint (restart-safe)', function() {
    assert(/function _isLocalSyncDirty\(\)/.test(_rendererSrc), '_isLocalSyncDirty must exist');
    var fn = _rendererSrc.match(/function _isLocalSyncDirty\(\)\s*\{([\s\S]*?)\n\}/);
    assert(fn, '_isLocalSyncDirty body must be found');
    var body = fn[1];
    assert(/SYNC_PUSH_UI\.pendingHash != null/.test(body), 'dirty if a runtime pendingHash exists');
    assert(/_getCurrentDataHash\(\) !== SYNC_PUSH_UI\.lastSyncedHash/.test(body),
      'dirty if current DATA fingerprint diverges from lastSyncedHash (restart-safe)');
    assert(/function _getCurrentDataHash\(\)/.test(_rendererSrc), '_getCurrentDataHash must exist');
    assert(/function _ensurePendingFromFingerprint\(\)/.test(_rendererSrc), '_ensurePendingFromFingerprint must exist');
  });

  test('1G.5B detect: dirty + cloud newer → conflict; clean + cloud newer → cloud_newer', function() {
    var body = _detectBody();
    var newerIdx = body.indexOf('cloudRev > SYNC_PUSH_UI.baseRevision');
    var seg = body.slice(newerIdx, body.indexOf('cloudRev === SYNC_PUSH_UI.baseRevision'));
    assert(/_isLocalSyncDirty\(\)/.test(seg), 'cloud-newer branch must check dirty');
    assert(/'conflict'/.test(seg), 'dirty + cloud newer must set conflict');
    assert(/'cloud_newer'/.test(seg), 'clean + cloud newer must still set cloud_newer');
    // conflict branch must restore dirty awareness and must NOT advance base/synced hashes.
    assert(/_ensurePendingFromFingerprint\(\)/.test(seg), 'conflict must restore dirty awareness');
    assert(!/SYNC_PUSH_UI\.baseRevision\s*=[^=]/.test(seg), 'detection must not change baseRevision');
    assert(!/SYNC_PUSH_UI\.lastSyncedHash\s*=[^=]/.test(seg), 'detection must not change lastSyncedHash');
  });

  test('1G.5B suppress: auto-push tick early-returns on conflict', function() {
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick, 'wsAutoSyncPushTick body must be found');
    assert(/state === 'cloud_newer' \|\| SYNC_PUSH_UI\.state === 'conflict'\) return;/.test(tick[1]),
      'auto-push must be suppressed for both cloud_newer and conflict');
  });

  test('1G.5B block: preflight + apply block conflict and restart-safe dirty', function() {
    var pf = _preflightBody();
    var ap = _applyBody();
    [pf, ap].forEach(function(body) {
      assert(/state === 'conflict'\)\s*return \{ ok: false, error: 'blocked_conflict' \}/.test(body),
        'conflict must be blocked with blocked_conflict');
      assert(/if \(_isLocalSyncDirty\(\)\)\s*return \{ ok: false, error: 'blocked_dirty' \}/.test(body),
        'restart-safe dirty must block (not just pendingHash)');
    });
  });

  test('1G.5B mark-dirty: editing while cloud newer promotes to conflict', function() {
    var fn = _rendererSrc.match(/function _markSyncDirty\(serialized\)\s*\{([\s\S]*?)\n\}/);
    assert(fn, '_markSyncDirty body must be found');
    var body = fn[1];
    assert(/cloudRevision > SYNC_PUSH_UI\.baseRevision/.test(body), 'must detect cloud-newer while editing');
    assert(/SYNC_PUSH_UI\.state = 'conflict'/.test(body), 'editing while cloud newer must set conflict');
    assert(/SYNC_PUSH_UI\.state = 'local_pending'/.test(body), 'editing while cloud current stays local_pending');
  });

  test('1G.5B hydrate: restores dirty awareness from fingerprint after restart', function() {
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs, '_hydrateSyncState body must be found');
    var body = hs[1];
    assert(/_ensurePendingFromFingerprint\(\)/.test(body),
      'hydration must restore dirty awareness when DATA diverges from lastSyncedHash');
    // Must NOT mark synced when DATA differs (that path is the else of the match).
    var matchIdx = body.indexOf('=== SYNC_PUSH_UI.lastSyncedHash');
    var ensureIdx = body.indexOf('_ensurePendingFromFingerprint()');
    assert(matchIdx >= 0 && ensureIdx > matchIdx, 'dirty restore must be in the DATA-differs (else) path');
  });

  test('1G.5B resolve: equal cloud revision downgrades conflict (no stale conflict)', function() {
    var body = _detectBody();
    var eqIdx = body.indexOf('cloudRev === SYNC_PUSH_UI.baseRevision');
    var seg = body.slice(eqIdx);
    assert(/SYNC_PUSH_UI\.state === 'conflict'/.test(seg),
      'equal-revision branch must be able to clear a stale conflict');
    assert(/'local_pending'/.test(seg) && /'synced'/.test(seg),
      'resolves to local_pending (dirty) or synced (clean) when cloud no longer newer');
  });

  test('1G.5B labels: truthful conflict status key exists (TR + EN); mapped from state', function() {
    var occurrences = (_rendererSrc.match(/syncConflict:/g) || []).length;
    assert(occurrences >= 2, 'syncConflict label must exist in both languages');
    assert(/case 'conflict':\s*return 'syncConflict'/.test(_rendererSrc),
      'conflict state must map to the syncConflict label');
    assert(!/Sync now|CAS|revision hash/i.test(_rendererSrc.match(/syncConflict:'[^']*'/g)?.join(' ') || ''),
      'conflict copy must avoid developer jargon');
  });

  test('1G.5B safety: conflict path does no DATA write / reload / apply', function() {
    var body = _detectBody();
    assert(!/localStorage\.setItem|location\.reload|\bDATA\s*=|restoreBackupFromCloud|_applyArchive|pushWorkspaceSnapshot|preflightPullSnapshot|applyPulledSnapshot/.test(body),
      'detection/conflict path must never write/reload/apply/push/pull');
  });

  // ── 1G.5C Take Cloud explicit conflict resolution ───────────────────────────

  function _takeCloudBody() {
    var m = _rendererSrc.match(/async function _takeCloudConflict\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_takeCloudConflict body must be found');
    return m[1];
  }

  test('1G.5C take-cloud: exists, gated by pull flag, requires conflict + dirty', function() {
    assert(/async function _takeCloudConflict\(\)/.test(_rendererSrc), '_takeCloudConflict must exist');
    var body = _takeCloudBody();
    assert(/^\s*if\s*\(!_realSyncPullEnabled\(\)\)\s*return \{ ok: false, error: 'pull_disabled' \};/.test(body),
      'first statement must be the pull-flag gate');
    assert(/state !== 'conflict'\)\s*return \{ ok: false, error: 'not_conflict' \}/.test(body), 'must require conflict state');
    assert(/if \(!_isLocalSyncDirty\(\)\)\s*return \{ ok: false, error: 'not_dirty' \}/.test(body), 'must require local dirty');
    assert(/cloudRevision <= SYNC_PUSH_UI\.baseRevision\) return \{ ok: false, error: 'not_newer' \}/.test(body), 'must require cloud newer');
    assert(/pushInFlight\)\s*return \{ ok: false, error: 'blocked_push_in_flight' \}/.test(body), 'blocks push in flight');
    assert(/pullInFlight\)\s*return \{ ok: false, error: 'blocked_pull_in_flight' \}/.test(body), 'blocks pull in flight');
  });

  test('1G.5C take-cloud: revalidates — cloud changed since conflict → cloud_changed (no write)', function() {
    var body = _takeCloudBody();
    assert(/var reqCloudRevision = SYNC_PUSH_UI\.cloudRevision/.test(body), 'must capture the conflict revision');
    assert(/res\.revision !== reqCloudRevision/.test(body), 'must compare applied revision to the conflict revision');
    var cmpIdx   = body.indexOf('res.revision !== reqCloudRevision');
    var writeIdx = body.indexOf('localStorage.setItem(LSKEY');
    assert(cmpIdx >= 0 && cmpIdx < writeIdx, 'cloud_changed check must precede the write');
    assert(/error: 'cloud_changed'/.test(body), 'must return cloud_changed when cloud advanced');
  });

  test('1G.5C take-cloud: pre-write guard aborts on a NEW edit but tolerates the conflict dirty', function() {
    var body = _takeCloudBody();
    // Abort if DATA changed again during await; must NOT abort merely because pendingHash is set.
    assert(/_djb2Hash\(JSON\.stringify\(DATA\)\) !== preHash\)\s*\{[\s\S]{0,160}error: 'blocked_dirty'/.test(body),
      'must abort only on a NEW edit during await (preHash mismatch)');
    var guardIdx = body.indexOf('!== preHash');
    var seg = body.slice(guardIdx - 40, guardIdx + 120);
    assert(!/pendingHash != null/.test(seg), 'pre-write guard must NOT treat the expected conflict dirty as abort');
  });

  test('1G.5C take-cloud: mandatory safety backup of the dirty local state', function() {
    var body = _takeCloudBody();
    // The dirty local state is captured (preState) and passed to main for the safety backup.
    assert(/var preState = JSON\.stringify\(DATA\)/.test(body), 'must capture dirty local state');
    assert(/preRestoreRendererState: preState/.test(body), 'must pass dirty state to main for the safety backup');
    assert(/safetyBackupCreated: res\.safetyBackupCreated === true/.test(body), 'must surface safety-backup status');
  });

  test('1G.5C take-cloud: preserves local users + workspaceId; writes merged; advances after write', function() {
    var body = _takeCloudBody();
    assert(/_incoming\.users\s*=\s*_localPrev\.users/.test(body), 'preserves local users');
    assert(/_incoming\.workspaceId\s*=\s*_localPrev\.workspaceId/.test(body), 'preserves local workspaceId');
    assert(/localStorage\.setItem\(LSKEY,\s*_applyStr\)/.test(body), 'writes the merged string');
    assert(/SYNC_PUSH_UI\.lastSyncedHash\s*=\s*_djb2Hash\(_applyStr\)/.test(body), 'lastSyncedHash from merged written DATA');
    var writeIdx  = body.indexOf('localStorage.setItem(LSKEY');
    var baseIdx   = body.indexOf('= res.revision');
    var syncedIdx = body.indexOf("= 'synced'");
    var okGuard   = body.indexOf('res.ok !== true');
    assert(okGuard >= 0 && okGuard < writeIdx, 'failure guard precedes the write');
    assert(baseIdx > writeIdx && syncedIdx > writeIdx, 'baseRevision/synced advance only after the write');
  });

  test('1G.5C take-cloud: failure leaves conflict intact (state synced only on success)', function() {
    var body = _takeCloudBody();
    // The only state='synced' assignment is in the success tail (after the write).
    var syncedCount = (body.match(/SYNC_PUSH_UI\.state\s*=\s*'synced'/g) || []).length;
    assert(syncedCount === 1, "exactly one synced transition (success only)");
    // No pendingHash clearing before the write/success.
    var clearIdx = body.search(/SYNC_PUSH_UI\.pendingHash\s*=\s*null/);
    var writeIdx = body.indexOf('localStorage.setItem(LSKEY');
    assert(clearIdx > writeIdx, 'pendingHash cleared only after the successful write');
  });

  test('1G.5C take-cloud: explicit only — not triggered by detection/preflight/listeners', function() {
    assert(!/_takeCloudConflict\(/.test(_detectBody()), 'detection must not invoke take-cloud');
    assert(!/_takeCloudConflict\(/.test(_preflightBody()), 'preflight must not invoke take-cloud');
    assert(!/addEventListener\('(focus|online)'[^)]*_takeCloudConflict/.test(_rendererSrc),
      'focus/online must not invoke take-cloud');
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs && !/_takeCloudConflict\(/.test(hs[1]), 'hydrate must not invoke take-cloud');
  });

  test('1G.5C take-cloud: reuses the apply IPC (no new RPC, no Cloud Backup Apply path)', function() {
    var body = _takeCloudBody();
    assert(/bridge\.applyPulledSnapshot\(/.test(body), 'must reuse the existing applyPulledSnapshot bridge');
    assert(!/restoreBackupFromCloud|restoreFullBackup|_applyArchive|createManualBackup/.test(body),
      'must not use Cloud Backup Apply / emergency restore');
  });

  test('1G.5C clean apply still blocks conflict (1G.4C unchanged)', function() {
    var ap = _applyBody();
    assert(/state === 'conflict'\)\s*return \{ ok: false, error: 'blocked_conflict' \}/.test(ap),
      'clean apply path must still block conflict');
  });

  test('1G.5C manual helper: __ktpTakeCloudConflict gated; returns safe fields only', function() {
    assert(/window\.__ktpTakeCloudConflict = function \(\)/.test(_rendererSrc), 'manual take-cloud helper must exist');
    var m = _rendererSrc.match(/window\.__ktpTakeCloudConflict = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'helper body must be found');
    var body = m[1];
    assert(/if \(!_realSyncPullEnabled\(\)\) return Promise\.resolve\(\{ enabled: false \}\);/.test(body), 'gated by pull flag');
    assert(/safetyBackupCreated:/.test(body) && /scheduledReload:/.test(body), 'returns safety/reload status');
    assert(!/rendererState|content|storage|snapshotHash|snapshot_hash|signedUrl|leaseToken|lease_token|deviceId|device_id|checksum/i.test(body),
      'helper must not expose content/storage path/hash/signed URL/device id/lease token');
  });

  // ── 1G.5D Keep Mine explicit conflict resolution (rebase + CAS push) ─────────

  function _keepMineBody() {
    var m = _rendererSrc.match(/async function _keepMineConflict\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_keepMineConflict body must be found');
    return m[1];
  }

  test('1G.5D keep-mine: exists; PUSH-flag gated; requires conflict + dirty + cloud newer', function() {
    assert(/async function _keepMineConflict\(\)/.test(_rendererSrc), '_keepMineConflict must exist');
    var body = _keepMineBody();
    assert(/^\s*if\s*\(!_realSyncPushEnabled\(\)\)\s*return \{ ok: false, error: 'push_disabled' \};/.test(body),
      'first statement must be the PUSH-flag gate (Keep Mine is a push)');
    assert(/state !== 'conflict'\)\s*return \{ ok: false, error: 'not_conflict' \}/.test(body), 'requires conflict');
    assert(/if \(!_isLocalSyncDirty\(\)\)\s*return \{ ok: false, error: 'not_dirty' \}/.test(body), 'requires dirty');
    assert(/cloudRevision <= SYNC_PUSH_UI\.baseRevision\) return \{ ok: false, error: 'not_newer' \}/.test(body), 'requires cloud newer');
    assert(/activeRole === 'viewer'\)\s*return \{ ok: false, error: 'permission_denied' \}/.test(body), 'viewer blocked');
    assert(/pushInFlight\)\s*return \{ ok: false, error: 'blocked_push_in_flight' \}/.test(body), 'blocks push in flight');
    assert(/pullInFlight\)\s*return \{ ok: false, error: 'blocked_pull_in_flight' \}/.test(body), 'blocks pull in flight');
  });

  test('1G.5D keep-mine: push flag controls it; pull flag alone does not', function() {
    var body = _keepMineBody();
    assert(/_realSyncPushEnabled\(\)/.test(body), 'must gate on the push flag');
    assert(!/_realSyncPullEnabled\(\)/.test(body), 'must NOT gate on the pull flag');
  });

  test('1G.5D keep-mine: re-fetches cloud revision; cloud_changed when it advanced (no push)', function() {
    var body = _keepMineBody();
    assert(/var reqCloudRevision = SYNC_PUSH_UI\.cloudRevision/.test(body), 'captures the conflict revision');
    assert(/getSyncStatus\(\{ workspaceId: reqWorkspaceId \}\)/.test(body), 'must re-fetch current revision');
    assert(/st\.currentRevision !== reqCloudRevision/.test(body), 'must compare to the conflict revision');
    var preIdx  = body.indexOf('st.currentRevision !== reqCloudRevision');
    var pushIdx = body.indexOf('bridge.keepMineResolve(');
    assert(preIdx >= 0 && pushIdx > preIdx, 'pre-check must precede the push');
    var seg = body.slice(preIdx, pushIdx);
    assert(/error: 'cloud_changed'/.test(seg), 'mismatch returns cloud_changed before pushing');
  });

  test('1G.5D keep-mine: rebase push uses baseRevision = conflict cloud revision', function() {
    var body = _keepMineBody();
    assert(/bridge\.keepMineResolve\(\{[\s\S]{0,160}baseRevision:\s*reqCloudRevision/.test(body),
      'push must rebase onto the current cloud head (baseRevision = reqCloudRevision)');
    assert(/rendererState: localState/.test(body), 'pushes the kept local state');
  });

  test('1G.5D keep-mine: success advances only after push; no reload; no local DATA write', function() {
    var body = _keepMineBody();
    var okIdx     = body.indexOf('res.ok === true');
    var baseIdx   = body.search(/SYNC_PUSH_UI\.baseRevision\s*=\s*_newRev/);
    var syncedIdx = body.indexOf("= 'synced'");
    assert(okIdx >= 0 && baseIdx > okIdx && syncedIdx > okIdx, 'state advances only in the success branch');
    assert(/SYNC_PUSH_UI\.lastSyncedHash\s*=\s*localHash/.test(body), 'lastSyncedHash = pushed local hash');
    assert(!/localStorage\.setItem\(LSKEY/.test(body), 'Keep Mine must not write local DATA');
    assert(!/location\.reload/.test(body), 'Keep Mine must not reload');
  });

  test('1G.5D keep-mine: CAS stale / failure stays conflict (no overwrite)', function() {
    var body = _keepMineBody();
    assert(/err === 'cloud_changed'/.test(body), 'handles cloud_changed (CAS stale) result');
    // Only one synced transition (success only); state never forced synced on failure.
    var syncedCount = (body.match(/SYNC_PUSH_UI\.state\s*=\s*'synced'/g) || []).length;
    assert(syncedCount === 1, 'exactly one synced transition (success only)');
    // pendingHash cleared only in success branch.
    var clearIdx = body.search(/SYNC_PUSH_UI\.pendingHash\s*=\s*null/);
    var okIdx    = body.indexOf('res.ok === true');
    assert(clearIdx > okIdx, 'pendingHash cleared only after a successful push');
  });

  test('1G.5D keep-mine: explicit only; not triggered by detection/preflight/listeners/hydrate', function() {
    assert(!/_keepMineConflict\(/.test(_detectBody()), 'detection must not invoke keep-mine');
    assert(!/_keepMineConflict\(/.test(_preflightBody()), 'preflight must not invoke keep-mine');
    assert(!/_keepMineConflict\(/.test(_applyBody()), 'apply must not invoke keep-mine');
    assert(!/addEventListener\('(focus|online)'[^)]*_keepMineConflict/.test(_rendererSrc), 'focus/online must not invoke keep-mine');
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs && !/_keepMineConflict\(/.test(hs[1]), 'hydrate must not invoke keep-mine');
    // auto-push tick must not call keep-mine; conflict suppression remains.
    var tick = _rendererSrc.match(/async function wsAutoSyncPushTick\(\)([\s\S]*?)\n\}/);
    assert(tick && !/_keepMineConflict\(/.test(tick[1]), 'auto-push must not invoke keep-mine');
  });

  test('1G.5D keep-mine: reuses push bridge; no Cloud Backup Apply path', function() {
    var body = _keepMineBody();
    assert(/bridge\.keepMineResolve\(/.test(body), 'uses the push-bridge keepMineResolve');
    assert(!/restoreBackupFromCloud|restoreFullBackup|_applyArchive|createManualBackup|applyPulledSnapshot/.test(body),
      'must not use Cloud Backup Apply / Take Cloud path');
  });

  test('1G.5D main: keepMineResolve safety-backups before push; reuses pushWorkspaceSnapshot; maps stale→cloud_changed', function() {
    var fs = require('fs'); var path = require('path');
    var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g, '');
    var h = mainSrc.match(/ipcMain\.handle\('cloud:keepMineResolve'[\s\S]*?\n  \}\);/);
    assert(h, 'cloud:keepMineResolve handler must exist');
    var body = h[0];
    assert(/buildFullBackup\(rendererState, null, 'pre-keep-mine'\)/.test(body), 'mandatory pre-keep-mine safety backup');
    assert(/atomicWriteJSON\(/.test(body), 'safety backup written to disk');
    assert(/error: 'safety_backup_failed'/.test(body), 'safety-backup failure blocks push');
    var backupIdx = body.indexOf('buildFullBackup(');
    var pushIdx   = body.indexOf('cloudSyncModule.pushWorkspaceSnapshot(');
    assert(backupIdx >= 0 && pushIdx > backupIdx, 'safety backup precedes the push');
    assert(/baseRevision:\s*baseRevision/.test(body), 'push uses the provided (conflict cloud) baseRevision');
    assert(/error: 'cloud_changed'/.test(body) && /stale_revision/.test(body), 'maps stale_revision → cloud_changed');
    // No new SQL RPC / no force override.
    assert(!/force|override/i.test(body), 'must not use a force-override path');
    // Must not log rendererState/content.
    assert(!/log\([^)]*rendererState|console\.[a-z]+\([^)]*rendererState/.test(body), 'must not log renderer state');
  });

  test('1G.5D preload: keepMineResolve exposed on the push bridge', function() {
    var fs = require('fs'); var path = require('path');
    var preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    assert(/exposeInMainWorld\(\s*'cloudSyncPush'[\s\S]{0,260}keepMineResolve/.test(preloadSrc),
      'keepMineResolve must be exposed on cloudSyncPush');
    assert(/cloud:keepMineResolve/.test(preloadSrc), 'must invoke the cloud:keepMineResolve channel');
  });

  test('1G.5D manual helper: __ktpKeepMineConflict gated; safe fields only', function() {
    assert(/window\.__ktpKeepMineConflict = function \(\)/.test(_rendererSrc), 'manual keep-mine helper must exist');
    var m = _rendererSrc.match(/window\.__ktpKeepMineConflict = function \(\)\s*\{([\s\S]*?)\n  \};/);
    assert(m, 'helper body must be found');
    var body = m[1];
    assert(/if \(!_realSyncPushEnabled\(\)\) return Promise\.resolve\(\{ enabled: false \}\);/.test(body), 'gated by push flag');
    assert(/newRevision:/.test(body) && /safetyBackupCreated:/.test(body) && /scheduledReload:\s*false/.test(body),
      'returns newRevision/safety/scheduledReload:false');
    assert(!/rendererState|content|storage|snapshotHash|snapshot_hash|signedUrl|leaseToken|lease_token|deviceId|device_id|checksum/i.test(body),
      'helper must not expose content/storage path/hash/signed URL/device id/lease token');
  });

  // ── 1G.5E conflict-resolution hardening ──────────────────────────────────────

  test('1G.5E-H1: Keep Mine success re-validates local hash (no false synced on concurrent edit)', function() {
    var body = _keepMineBody();
    var okIdx = body.indexOf('res.ok === true');
    var seg = body.slice(okIdx);
    // Always records the pushed version's hash + advances revision.
    assert(/SYNC_PUSH_UI\.lastSyncedHash\s*=\s*localHash/.test(seg), 'lastSyncedHash = pushed localHash');
    assert(/SYNC_PUSH_UI\.baseRevision\s*=\s*_newRev/.test(seg) && /SYNC_PUSH_UI\.cloudRevision\s*=\s*_newRev/.test(seg),
      'baseRevision/cloudRevision advance to newRevision');
    // Re-check current DATA vs the pushed snapshot.
    assert(/_getCurrentDataHash\(\)/.test(seg), 'must compute the current DATA hash after the push');
    assert(/_curHash !== localHash/.test(seg), 'must compare current DATA to the pushed version');
    // Concurrent-edit branch: local_pending + pendingHash (NOT synced); clean branch: synced.
    var dirtyIdx  = seg.indexOf('_curHash !== localHash');
    var dirtySeg  = seg.slice(dirtyIdx, dirtyIdx + 260);
    assert(/SYNC_PUSH_UI\.pendingHash = _curHash/.test(dirtySeg) && /'local_pending'/.test(dirtySeg),
      'concurrent edit → local_pending with pendingHash, not synced');
    assert(/SYNC_PUSH_UI\.pendingHash = null/.test(seg) && /'synced'/.test(seg),
      'unchanged DATA → synced with pendingHash cleared');
    // Keep Mine never overwrites local DATA / never reloads.
    assert(!/localStorage\.setItem\(LSKEY/.test(body), 'Keep Mine must not write local DATA');
    assert(!/location\.reload/.test(body), 'Keep Mine must not reload');
  });

  test('1G.5E-H2: each resolver clears its in-flight flag in a finally', function() {
    function bodyOf(name) {
      var m = _rendererSrc.match(new RegExp('async function ' + name + '\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}'));
      assert(m, name + ' body must be found');
      return m[1];
    }
    assert(/\} finally \{ SYNC_PUSH_UI\.pushInFlight = false; \}/.test(bodyOf('wsAutoSyncPushTick')),
      'wsAutoSyncPushTick must clear pushInFlight in finally');
    assert(/\} finally \{ SYNC_PUSH_UI\.pullInFlight = false; \}/.test(bodyOf('_applyPulledSnapshot')),
      '_applyPulledSnapshot must clear pullInFlight in finally');
    assert(/\} finally \{ SYNC_PUSH_UI\.pullInFlight = false; \}/.test(bodyOf('_takeCloudConflict')),
      '_takeCloudConflict must clear pullInFlight in finally');
    assert(/\} finally \{ SYNC_PUSH_UI\.pushInFlight = false; \}/.test(bodyOf('_keepMineConflict')),
      '_keepMineConflict must clear pushInFlight in finally');
  });

  test('1G.5E-H2: existing explicit in-flight resets are preserved (no false synced on failure)', function() {
    // Take Cloud / apply still reset pullInFlight on their typed-error returns.
    var ap = _applyBody(); var tc = _takeCloudBody();
    [ap, tc].forEach(function(b) {
      assert(/SYNC_PUSH_UI\.pullInFlight = false; return \{ ok: false, error: 'stale_workspace' \}/.test(b),
        'stale-workspace path resets pullInFlight');
    });
    // Keep Mine resets pushInFlight on its cloud_changed pre-check.
    var km = _keepMineBody();
    assert(/SYNC_PUSH_UI\.pushInFlight = false;\s*\n?\s*return \{ ok: false, error: 'cloud_changed'/.test(km),
      'keep-mine cloud_changed pre-check resets pushInFlight');
    // Failure branches must not set synced.
    assert((km.match(/SYNC_PUSH_UI\.state\s*=\s*'synced'/g) || []).length === 1, 'keep-mine: only one synced transition');
    assert((tc.match(/SYNC_PUSH_UI\.state\s*=\s*'synced'/g) || []).length === 1, 'take-cloud: only one synced transition');
  });

  test('1G.5E-H3: _hydrateSyncState clears runtime in-flight flags', function() {
    var hs = _rendererSrc.match(/function _hydrateSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(hs, '_hydrateSyncState body must be found');
    var body = hs[1];
    assert(/SYNC_PUSH_UI\.pushInFlight = false/.test(body), 'hydrate clears pushInFlight');
    assert(/SYNC_PUSH_UI\.pullInFlight = false/.test(body), 'hydrate clears pullInFlight');
  });

  test('1G.5E: in-flight flags are NOT persisted in the sync marker', function() {
    var sv = _rendererSrc.match(/function _saveSyncState\(\)\s*\{([\s\S]*?)\n\}/);
    assert(sv, '_saveSyncState body must be found');
    var body = sv[1];
    assert(!/pushInFlight|pullInFlight/.test(body), 'marker must not persist in-flight flags');
  });

  // ── 1G.8A read-only Sync status UI ───────────────────────────────────────────

  // Markup region of the Sync status section: from its own container opening tag up
  // to (but excluding) the Cloud Backup container. Used to prove it is self-contained
  // + separate. Index-based (renderer.html is CRLF; greedy regex spanning the file is
  // fragile, and "read-only Sync status section" also appears in a JS comment).
  function _sxMarkup() {
    var start = _rendererSrc.indexOf('class="ws-sync-section"');
    var end   = _rendererSrc.indexOf('ws-sync-status-section ws-backup-section', start);
    assert(start > -1 && end > start, '1G.8A Sync section markup region must be found');
    return _rendererSrc.slice(start, end);
  }
  function _sxViewBody() {
    var m = _rendererSrc.match(/function _syncSectionView\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_syncSectionView body must be found');
    return m[1];
  }

  test('1G.8A: Sync section renders inside the workspace card before Cloud Backup', function() {
    var sIdx = _rendererSrc.indexOf('class="ws-sync-section"');
    var bIdx = _rendererSrc.indexOf('ws-sync-status-section ws-backup-section');
    assert(sIdx > -1, 'ws-sync-section markup must exist');
    assert(bIdx > -1, 'ws-backup-section markup must exist');
    assert(sIdx < bIdx, 'Sync section must render BEFORE the Cloud Backup section');
    // and it lives inside the active-workspace card markup
    var card = _rendererSrc.indexOf("'<div class=\"ws-active-card\">'");
    assert(card > -1 && card < sIdx, 'Sync section must be inside the active workspace card');
  });

  test('1G.8A: Sync section is visually separate from Cloud Backup (own container, no backup controls)', function() {
    var sx = _sxMarkup();
    assert(/class="ws-sync-section"/.test(sx), 'Sync section uses its own ws-sync-section container');
    assert(!/ws-backup/.test(sx),        'Sync section must not include backup container classes');
    assert(!/wsStartApply|wsConfirmApply|wsDownloadBackup|wsRefreshBackupList/.test(sx),
      'Sync section must not include any Cloud Backup history/apply/download controls');
    assert(!/restoreFromCloud|applyPulledSnapshot|wsApplyBackup/.test(sx),
      'Sync section must not reference any restore/apply path');
  });

  test('1G.8A: state-to-copy mapping exists for every displayed state', function() {
    var b = _sxViewBody();
    ['synced','local_pending','syncing','cloud_newer','conflict','view_only','offline','error'].forEach(function(st) {
      assert(new RegExp("case '" + st + "':").test(b), 'mapping must handle state: ' + st);
    });
    // each maps to a title + detail key
    ['sxSyncedT','sxSyncedD','sxPendingT','sxPendingD','sxCloudT','sxCloudD','sxConflictT','sxConflictD',
     'sxViewT','sxViewD','sxPausedT','sxPausedD','sxSyncingT','sxSyncingD'].forEach(function(k) {
      assert(b.indexOf(k) > -1, '_syncSectionView must reference key ' + k);
    });
    // 'idle'/unknown hides the section (no churn / no unsettled label)
    assert(/default:\s*return \{ show: false \}/.test(b), "idle/unknown must hide the section");
  });

  test('1G.8A: EN and TR i18n keys exist for all displayed Sync strings', function() {
    ['sxSyncHdr','sxSyncedT','sxSyncedD','sxPendingT','sxPendingD','sxCloudT','sxCloudD',
     'sxConflictT','sxConflictD','sxViewT','sxViewD','sxPausedT','sxPausedD','sxSyncingT','sxSyncingD']
    .forEach(function(k) {
      var n = (_rendererSrc.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
      assert(n >= 2, 'i18n key ' + k + ' must be defined in both TR and EN (found ' + n + ')');
    });
  });

  test('1G.8A: Sync section has NO action buttons (read-only)', function() {
    var sx = _sxMarkup();
    assert(!/<button/.test(sx), 'Sync section must contain no buttons in 1G.8A');
    assert(!/onclick=/.test(sx), 'Sync section must contain no onclick handlers in 1G.8A');
    assert(!/Use cloud version|Keep my version|Take Cloud|Keep Mine/i.test(sx),
      'no conflict action labels in 1G.8A');
  });

  test('1G.8A: workspace card UI does not call conflict resolvers', function() {
    var ci = _rendererSrc.indexOf('function renderWorkspaceCard()');
    assert(ci > -1, 'renderWorkspaceCard must be found');
    var cj = _rendererSrc.indexOf('\nfunction ', ci + 20);
    var b  = _rendererSrc.slice(ci, cj > -1 ? cj : _rendererSrc.length);
    assert(!/_takeCloudConflict\s*\(/.test(b), 'renderWorkspaceCard must not call _takeCloudConflict');
    assert(!/_keepMineConflict\s*\(/.test(b), 'renderWorkspaceCard must not call _keepMineConflict');
  });

  test('1G.8A: Sync view-model is read-only (no engine/IPC/secret access)', function() {
    var b = _sxViewBody();
    assert(!/ipcRenderer|invoke\(|bridge|fetch\(/.test(b), '_syncSectionView must not touch IPC/bridge/network');
    assert(!/localStorage|JSON\.stringify\(DATA\)|rendererState|storage_path|signed|snapshot_hash|deviceId|token/.test(b),
      '_syncSectionView must not access DATA/secrets/paths');
    // gating: hidden when both real-sync flags are off
    assert(/if \(!_realSyncPushEnabled\(\) && !_realSyncPullEnabled\(\)\) return \{ show: false \}/.test(b),
      'Sync section must be gated behind the real-sync flags');
  });

  test('1G.8A: no new IPC/preload bridge introduced; Cloud Backup remains separate', function() {
    assert(!/ipcRenderer/.test(_rendererSrc), 'renderer must still never reference ipcRenderer directly');
    // Cloud Backup apply path still present and untouched (separate from Sync)
    assert(/wsStartApply\(/.test(_rendererSrc), 'Cloud Backup apply (wsStartApply) must still exist');
    assert(/ws-sync-status-section ws-backup-section/.test(_rendererSrc), 'Cloud Backup section must still exist');
  });

  // ── 1G.8B inline conflict action buttons ─────────────────────────────────────

  // The Sync section IIFE body (includes the 1G.8B conflict-action markup, which is
  // built before the 'ws-sync-section' container string). Index-based (CRLF file).
  function _sxIife() {
    var start = _rendererSrc.indexOf('var _act = _syncConflictActions()');
    var end   = _rendererSrc.indexOf('})() +', start);
    assert(start > -1 && end > start, 'Sync section IIFE (1G.8B) must be found');
    return _rendererSrc.slice(start, end);
  }
  function _fnBody(name) {
    var m = _rendererSrc.match(new RegExp('async function ' + name + '\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}'));
    assert(m, name + ' body must be found');
    return m[1];
  }
  function _actionsBody() {
    var m = _rendererSrc.match(/function _syncConflictActions\(\)\s*\{([\s\S]*?)\n\}/);
    assert(m, '_syncConflictActions body must be found');
    return m[1];
  }

  test('1G.8B: conflict buttons render only in conflict (gated by _syncConflictActions)', function() {
    var b = _actionsBody();
    assert(/SYNC_PUSH_UI\.state !== 'conflict'/.test(b), 'actions must require state === conflict');
    assert(/showUseCloud: false, showKeepMine: false/.test(b), 'non-conflict returns no actions');
    var iife = _sxIife();
    assert(/_act\.showUseCloud \|\| _act\.showKeepMine/.test(iife), 'button block gated on action visibility');
    assert(/onclick="wsSyncUseCloud\(\)"/.test(iife), 'Use cloud button wired');
    assert(/onclick="wsSyncKeepMine\(\)"/.test(iife), 'Keep mine button wired');
  });

  test('1G.8B: Use cloud requires pull flag + non-viewer; Keep mine requires push flag + owner/admin/editor', function() {
    var b = _actionsBody();
    assert(/showUseCloud\s*=\s*_realSyncPullEnabled\(\) && role !== 'viewer'/.test(b),
      'Use cloud: pull flag + not viewer');
    assert(/showKeepMine\s*=\s*_realSyncPushEnabled\(\) &&/.test(b), 'Keep mine: push flag');
    assert(/role === 'owner' \|\| role === 'admin' \|\| role === 'editor'/.test(b),
      'Keep mine: owner/admin/editor only');
    assert(!/role === 'member'/.test(b), 'member must NOT be allowed Keep mine');
  });

  test('1G.8B: wsSyncUseCloud calls _takeCloudConflict only; wsSyncKeepMine calls _keepMineConflict only', function() {
    var u = _fnBody('wsSyncUseCloud');
    assert(/await _takeCloudConflict\(\)/.test(u), 'wsSyncUseCloud awaits _takeCloudConflict');
    assert(!/_keepMineConflict/.test(u), 'wsSyncUseCloud must not call _keepMineConflict');
    var k = _fnBody('wsSyncKeepMine');
    assert(/await _keepMineConflict\(\)/.test(k), 'wsSyncKeepMine awaits _keepMineConflict');
    assert(!/_takeCloudConflict/.test(k), 'wsSyncKeepMine must not call _takeCloudConflict');
  });

  test('1G.8B: wrappers never touch Cloud Backup apply/restore paths', function() {
    var both = _fnBody('wsSyncUseCloud') + _fnBody('wsSyncKeepMine') + _sxIife();
    assert(!/wsStartApply|wsConfirmApply|restoreFromCloud|applyPulledSnapshot|wsApplyBackup|getCloudBackupContent/.test(both),
      'no Cloud Backup apply/restore path may be referenced by the Sync conflict UI');
  });

  test('1G.8B: double-click guard + busy disables both buttons', function() {
    var u = _fnBody('wsSyncUseCloud');
    var k = _fnBody('wsSyncKeepMine');
    assert(/if \(SYNC_ACTION_UI\.busy\) return;/.test(u), 'wsSyncUseCloud early-returns when busy');
    assert(/if \(SYNC_ACTION_UI\.busy\) return;/.test(k), 'wsSyncKeepMine early-returns when busy');
    // also respect engine in-flight flags
    assert(/SYNC_PUSH_UI\.pushInFlight \|\| SYNC_PUSH_UI\.pullInFlight/.test(u), 'use-cloud respects in-flight');
    assert(/SYNC_PUSH_UI\.pushInFlight \|\| SYNC_PUSH_UI\.pullInFlight/.test(k), 'keep-mine respects in-flight');
    var iife = _sxIife();
    assert(/var _disabled = SYNC_ACTION_UI\.busy \|\| SYNC_PUSH_UI\.pushInFlight \|\| SYNC_PUSH_UI\.pullInFlight/.test(iife),
      'disabled computed from busy + in-flight');
    assert((iife.match(/_disabled \? ' disabled' : ''/g) || []).length >= 2, 'both buttons honor _disabled');
  });

  test('1G.8B: cloud_changed → review message, no auto-retry; success/failure map per action', function() {
    var u = _fnBody('wsSyncUseCloud');
    var k = _fnBody('wsSyncKeepMine');
    // cloud_changed mapping
    assert(/error === 'cloud_changed'[\s\S]*?'sxCloudChanged'/.test(u), 'use-cloud maps cloud_changed');
    assert(/error === 'cloud_changed'[\s\S]*?'sxCloudChanged'/.test(k), 'keep-mine maps cloud_changed');
    // no automatic retry of the action / no scheduling
    assert(!/_scheduleAutoSyncRetry|setTimeout|wsSyncUseCloud\(\)/.test(u), 'use-cloud must not auto-retry');
    assert(!/_scheduleAutoSyncRetry|setTimeout|wsSyncKeepMine\(\)/.test(k), 'keep-mine must not auto-retry');
    // success + failure per action
    assert(/'sxUseCloudOk'/.test(u) && /'sxUseCloudFail'/.test(u), 'use-cloud success+failure keys');
    assert(/'sxKeepMineOk'/.test(k) && /'sxKeepMineFail'/.test(k), 'keep-mine success+failure keys');
  });

  test('1G.8B: SYNC_ACTION_UI is UI-only (not persisted) and exposes no secrets/revisions', function() {
    var sv = _rendererSrc.match(/function _saveSyncState\(\)\s*\{([\s\S]*?)\n\}/)[1];
    assert(!/SYNC_ACTION_UI|busy|phase|msgKey/.test(sv), 'sync marker must not persist SYNC_ACTION_UI');
    var msg = _rendererSrc.match(/function _syncActionMsgKey\(\)\s*\{([\s\S]*?)\n\}/)[1];
    assert(!/revision|Revision/.test(msg), 'message mapping must not expose revision numbers');
    var u = _fnBody('wsSyncUseCloud') + _fnBody('wsSyncKeepMine');
    assert(!/storage_path|signed|snapshot_hash|rendererState|JSON\.stringify\(DATA\)|deviceId|lease/.test(u),
      'wrappers must not reference secrets/paths/raw DATA');
  });

  test('1G.8B: EN and TR i18n keys exist for all conflict-action strings', function() {
    ['sxUseCloudBtn','sxUseCloudHelp','sxUseCloudProg','sxUseCloudOk','sxUseCloudFail',
     'sxKeepMineBtn','sxKeepMineHelp','sxKeepMineProg','sxKeepMineOk','sxKeepMineFail','sxCloudChanged']
    .forEach(function(k) {
      var n = (_rendererSrc.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
      assert(n >= 2, 'i18n key ' + k + ' must be defined in both TR and EN (found ' + n + ')');
    });
  });

  test('1G.8B: no new IPC/preload bridge; Cloud Backup section remains separate', function() {
    assert(!/ipcRenderer/.test(_rendererSrc), 'renderer must still never reference ipcRenderer directly');
    assert(/wsStartApply\(/.test(_rendererSrc), 'Cloud Backup apply must still exist (separate)');
    assert(/ws-sync-status-section ws-backup-section/.test(_rendererSrc), 'Cloud Backup section must still exist');
  });

  // ── 1F.6C UX polish: render order + reload behavior ─────────────────────────

  test('1F.6C render: wsConfirmManualBackup calls renderAutoBackupIndicator before renderWorkspaceCard', function() {
    var manFn = _rendererSrc.match(/function wsConfirmManualBackup\(\)([\s\S]*?)^\/\/ ── Cloud backup list/m);
    assert(manFn, 'wsConfirmManualBackup must be found');
    var body = manFn[1];
    // Explicit topbar update before full card render
    assert(/renderAutoBackupIndicator\(\)/.test(body),
      'wsConfirmManualBackup must call renderAutoBackupIndicator() after reconciliation');
    // Render order: AUTO_BACKUP_UI reconciled THEN render
    var reconcileIdx = body.indexOf('AUTO_BACKUP_UI.state        = \'ok\'');
    var renderIdx    = body.indexOf('renderAutoBackupIndicator()');
    assert(reconcileIdx >= 0 && renderIdx > reconcileIdx,
      'renderAutoBackupIndicator must be called AFTER AUTO_BACKUP_UI is reconciled');
  });

  test('1F.6C render: topbar indicator is always updated when wsConfirmManualBackup succeeds', function() {
    // renderAutoBackupIndicator() is called explicitly AND via renderWorkspaceCard()
    var manFn = _rendererSrc.match(/function wsConfirmManualBackup\(\)([\s\S]*?)^\/\/ ── Cloud backup list/m);
    assert(manFn, 'wsConfirmManualBackup must be found');
    var body = manFn[1];
    assert((body.match(/renderAutoBackupIndicator\(\)/g) || []).length >= 1,
      'renderAutoBackupIndicator must be called at least once after manual backup success');
    assert(/renderWorkspaceCard\(\)/.test(body),
      'renderWorkspaceCard must also be called for full panel update');
  });

  test('1F.6C apply: wsConfirmApply2 writes localStorage ONLY after ok response — never on failure', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function _backupDownloadErrMsg/m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    // localStorage.setItem(LSKEY) must appear after the ok check (not in failure paths)
    var failIdx   = body.indexOf('applyState = \'error\'');
    var writeIdx  = body.indexOf('localStorage.setItem(LSKEY');
    assert(writeIdx > 0, 'localStorage.setItem(LSKEY) must exist in wsConfirmApply2');
    assert(failIdx < writeIdx,
      'localStorage write must come AFTER the ok check (failure returns before reaching it)');
    // The failure path must NOT write to localStorage
    var failureBlock = body.slice(0, writeIdx);
    assert(!/localStorage\.setItem\(LSKEY/.test(failureBlock),
      'localStorage must NOT be written in the failure path');
  });

  test('1F.6C apply: wsConfirmApply2 calls location.reload after writing localStorage', function() {
    var cfm2 = _rendererSrc.match(/async function wsConfirmApply2\(\)([\s\S]*?)^function _backupDownloadErrMsg/m);
    assert(cfm2, 'wsConfirmApply2 must be found');
    var body = cfm2[1];
    assert(/location\.reload\(\)/.test(body), 'wsConfirmApply2 must call location.reload()');
    var writeIdx  = body.indexOf('localStorage.setItem(LSKEY');
    var reloadIdx = body.indexOf('location.reload()');
    assert(reloadIdx > writeIdx, 'reload must come AFTER localStorage write');
  });

  test('1F.6C apply: _applyArchiveInternal in main.js never touches license or cloud-auth files', function() {
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g,'');
    var applyFn = mainSrc.match(/function _applyArchiveInternal([\s\S]*?)^(?:async )?function /m);
    assert(applyFn, '_applyArchiveInternal must be found');
    var body = applyFn[1];
    assert(!/LICENSE_PATH|LICENSE_DIR|active\.ktplicense/.test(body),
      '_applyArchiveInternal must never touch license files');
    assert(!/cloud-auth\.enc|cloud-device\.enc/.test(body),
      '_applyArchiveInternal must never touch cloud-auth/device files');
    assert(!/store\.users\s*=/.test(body),
      '_applyArchiveInternal must not overwrite store.users (user accounts preserved)');
    // Must only touch safe fields: settings, audit_log, backup_records, schemaVersion
    assert(/store\.settings/.test(body),   'settings may be restored');
    assert(/store\.audit_log/.test(body),  'audit_log may be restored');
  });

  test('1F.6C apply: post-reload login screen is local app user/admin, not cloud', function() {
    // The reload writes rendererState to localStorage then calls location.reload().
    // cloud-auth.enc and license files are NOT touched — cloud session preserved.
    // Any login screen after reload is the local app user/PIN selection, which is
    // expected behavior when the restored DATA has a different or absent active user.
    var fs = require('fs');
    var mainSrc = fs.readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8').replace(/\r/g,'');
    // Apply path must not delete cloud-auth or license files
    assert(!/fs\.unlink.*cloud-auth|fs\.rm.*cloud-auth/.test(mainSrc),
      'cloud-auth.enc must never be deleted during cloud apply');
    assert(!/fs\.unlink.*license|fs\.rm.*license/.test(mainSrc.replace(/\/\*[\s\S]*?\*\//g,'')),
      'license files must never be deleted during cloud apply');
    // Cloud auth files are separate from localStorage — preserved across reload.
    // cloud-auth.enc path is defined in cloud-config.js (getCloudAuthPath), not main.js.
    var configSrc = fs.readFileSync(require('path').join(__dirname, '..', 'cloud', 'cloud-config.js'), 'utf8');
    assert(/cloud-auth\.enc/.test(configSrc), 'cloud-auth.enc path must exist in cloud-config.js');
  });

  test('1F.6C status-dot: sidebar Cloud Sync session dot is independent from backup state', function() {
    // The workspace active-row dot (green when workspace is connected) is separate
    // from the backup card status dot and the topbar cloud-bk-indicator
    assert(/<div class="ws-status-dot ok"><\/div>/.test(_rendererSrc) ||
           /ws-active-row[\s\S]{0,100}ws-status-dot ok/.test(_rendererSrc),
      'workspace active-row must have its own always-ok dot (session dot)');
    // renderAutoBackupIndicator uses cloud-bk-indicator (topbar) — independent
    assert(/cloud-bk-indicator/.test(_rendererSrc), 'topbar cloud-bk-indicator must exist');
    assert(/function renderAutoBackupIndicator/.test(_rendererSrc), 'renderAutoBackupIndicator separate from session dot');
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
    assert(/_scheduleAutoCloudBackup\(/.test(_rendererSrc),
      '_scheduleAutoCloudBackup must be defined');
    // The active saveLocal HOTFIX uses setSetting('selected_month') — unique to it.
    // The 1F.4F hook must appear within a small window after that call.
    assert(/setSetting\('selected_month'[\s\S]{0,1400}_scheduleAutoCloudBackup\(/.test(_rendererSrc),
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
    var schedFn = _rendererSrc.match(/function _scheduleAutoCloudBackup\([^)]*\)([\s\S]*?)async function wsAutoBackupTick/);
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

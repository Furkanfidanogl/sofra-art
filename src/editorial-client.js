// Editorial client state helpers: context validation, draft scoping, input preservation, and controller.

export const EDITORIAL_LIMITS = Object.freeze({
  note: Object.freeze({ min: 3, max: 180 }),
  question: Object.freeze({ min: 3, max: 160 }),
  description: Object.freeze({ min: 3, max: 1200 })
});

export function validateEditorialContext(reqContext, currentContext) {
  if (!reqContext || !currentContext) return false;
  const activeTicket = currentContext.activeTicket ?? currentContext.aiTicket;
  if (reqContext.ticket !== activeTicket) return false;
  if (!currentContext.isDialogOpen) return false;
  if (!currentContext.isAdmin) return false;
  const currentUid = currentContext.uid ?? currentContext.user?.uid;
  if (reqContext.uid !== currentUid) return false;
  const currentRevision = currentContext.revision ?? currentContext.viewRevision;
  if (reqContext.revision !== currentRevision) return false;
  const currentTab = currentContext.tab ?? currentContext.currentAdminTab;
  if (reqContext.tab !== currentTab) return false;
  const reqDate = reqContext.date ?? null;
  const currentDate = (currentContext.date !== undefined ? currentContext.date : currentContext.adminDate) ?? null;
  if (reqContext.tab === 'daily' && reqDate !== currentDate) return false;
  const reqArtId = reqContext.artworkId ?? null;
  const currentArtId = currentContext.artworkId ?? null;
  if (reqContext.tab === 'gallery' && reqArtId !== currentArtId) return false;
  return true;
}

export function applyEditorialDraft(target, draftText, state = {}) {
  const { tab, adminDate, dailyEditor = null, artworkEditor = null } = state;
  const nextDaily = dailyEditor
    ? { ...dailyEditor, daily: { ...(dailyEditor.daily || {}) } }
    : { date: adminDate || null, daily: {}, version: 0 };
  const nextArtwork = artworkEditor ? { ...artworkEditor } : {};

  if (target === 'quote') {
    nextDaily.daily.quote = draftText;
    return { target, dailyEditor: nextDaily, artworkEditor };
  }
  if (target === 'question') {
    nextDaily.daily.question = draftText;
    return { target, dailyEditor: nextDaily, artworkEditor };
  }
  if (target === 'description') {
    nextArtwork.description = draftText;
    return { target, dailyEditor, artworkEditor: nextArtwork };
  }
  if (target === 'artwork-question') {
    nextArtwork.question = draftText;
    return { target, dailyEditor, artworkEditor: nextArtwork };
  }
  return { target, dailyEditor, artworkEditor };
}

export function createEditorialController({
  getState,
  rememberEditor,
  getFormContext,
  generateEditorial,
  showAdmin,
  toast,
  backendErrorMessage,
  setAiBusy,
  setAiDraft,
  nextAiTicket,
  updateEditorState,
  updateDomField
}) {
  async function onDraftClick({ type, target }) {
    const state = getState();
    if (!state.isAdmin || !state.backendEnabled) return;
    if (state.aiBusy) return;
    if (!type || !target) return;

    rememberEditor();
    const context = typeof getFormContext === 'function' ? getFormContext(state.currentAdminTab) : {};

    setAiBusy(target, {
      tab: state.currentAdminTab,
      date: state.adminDate || null,
      artworkId: state.artworkId || null
    });
    showAdmin(state.currentAdminTab, false);

    const ticket = nextAiTicket();
    const snapshotState = getState();
    const reqContext = {
      ticket,
      uid: snapshotState.user?.uid,
      revision: snapshotState.viewRevision,
      tab: snapshotState.currentAdminTab,
      date: snapshotState.adminDate || null,
      artworkId: snapshotState.artworkId || null,
      target
    };

    const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `ai-${Date.now()}`;
    let draftResult = null;

    try {
      const result = await generateEditorial(type, context, requestId);
      if (result?.draft) {
        draftResult = result.draft;
      }
    } catch (err) {
      const latestState = getState();
      if (ticket === latestState.aiTicket && latestState.user?.uid === reqContext.uid && latestState.isDialogOpen) {
        const msg = (typeof backendErrorMessage === 'function' ? backendErrorMessage(err) : err?.message) || 'Öneri şu an üretilemedi. Elle yazmaya devam edebilirsin.';
        toast(msg);
      }
    } finally {
      const latestState = getState();
      const isCurrentTicket = ticket === latestState.aiTicket;
      if (isCurrentTicket) {
        setAiBusy(null, null);
      }
      if (validateEditorialContext(reqContext, latestState)) {
        rememberEditor();
        if (draftResult) {
          setAiDraft({
            type,
            target,
            text: draftResult,
            context: {
              tab: reqContext.tab,
              date: reqContext.date,
              artworkId: reqContext.artworkId,
              target
            }
          });
        }
        showAdmin(latestState.currentAdminTab, false);
      } else if (
        isCurrentTicket &&
        latestState.isDialogOpen &&
        latestState.isAdmin &&
        latestState.user?.uid === reqContext.uid
      ) {
        const isSameContext =
          latestState.currentAdminTab === reqContext.tab &&
          (reqContext.tab !== 'daily' || (latestState.adminDate || null) === (reqContext.date || null)) &&
          (reqContext.tab !== 'gallery' || (latestState.artworkId || null) === (reqContext.artworkId || null));

        if (isSameContext) {
          rememberEditor();
          showAdmin(latestState.currentAdminTab, false);
        }
      }
    }
  }

  function onDismissClick() {
    rememberEditor();
    setAiDraft(null);
    const state = getState();
    if (state.isDialogOpen) showAdmin(state.currentAdminTab, false);
  }

  function onApplyClick({ target }) {
    const state = getState();
    const draft = state.aiDraft;
    if (!draft?.text || !target || target !== draft.target) return;

    if (draft.context) {
      const ctx = draft.context;
      if (
        ctx.tab !== state.currentAdminTab ||
        (ctx.tab === 'daily' && (ctx.date || null) !== (state.adminDate || null)) ||
        (ctx.tab === 'gallery' && (ctx.artworkId || null) !== (state.artworkId || null))
      ) {
        setAiDraft(null);
        return;
      }
    }

    rememberEditor();
    const updated = applyEditorialDraft(target, draft.text, {
      tab: state.currentAdminTab,
      adminDate: state.adminDate,
      dailyEditor: state.dailyEditor,
      artworkEditor: state.artworkEditor
    });

    if (typeof updateEditorState === 'function') {
      updateEditorState(updated);
    }
    if (typeof updateDomField === 'function') {
      updateDomField(target, draft.text);
    }

    setAiDraft(null);
    if (getState().isDialogOpen) {
      showAdmin(state.currentAdminTab, false);
    }
    toast('Taslak önerisi alana aktarıldı. Dilediğin gibi düzenleyebilirsin.');
  }

  return {
    onDraftClick,
    onDismissClick,
    onApplyClick
  };
}

/* Obstacle rules shared by the entry form and the report.
   suggest(record, settings) -> { action, highlight } proposed automatically; the user can always override both.
   REMARKS band colours: red, yellow (LV), magenta (MV), purple (HV), blue, green (or none). */
(function (g) {
  const COLORS = ['red', 'yellow', 'magenta', 'purple', 'blue', 'green'];
  const DEFAULTS = {
    minHeight: 7.57,   // equipment minimum height (m), per project
    // reference heights entered per survey: a line at or above this height needs no action (no arc risk)
    refLV: null,       // low voltage / telephone  (default: minHeight + 1.0)
    refMV: null,       // medium voltage           (default: minHeight + 3.0)
    refHV: null,       // high voltage             (default: minHeight + 4.0)
  };
  const TEXT = {
    none: 'No Action Required',
    structure: 'Structure must be removed.',
    lvLift: 'Power must be turned off and the cables must be lifted.',
    lvOff: 'Power must be turned off.',
    mvOff: 'Power must be turned off.',
    hvOff: 'Power must be turned off before transportation.',
  };
  function refs(settings) {
    const s = Object.assign({}, DEFAULTS, settings || {});
    return { min: s.minHeight, LV: s.refLV ?? s.minHeight + 1.0, MV: s.refMV ?? s.minHeight + 3.0, HV: s.refHV ?? s.minHeight + 4.0 };
  }
  function lineClass(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('high')) return 'HV';
    if (t.includes('medium')) return 'MV';
    if (t.includes('low') || t.includes('tele')) return 'LV';
    return null;
  }
  function minH(rec) {
    const hs = (rec.heights || []).map(h => Number(h.value)).filter(v => isFinite(v) && v > 0);
    return hs.length ? Math.min(...hs) : null;
  }
  function suggest(rec, settings) {
    if (settings && settings.general) return { action: '', highlight: null };   // general survey: no cargo, no automatic checks
    const r = refs(settings), h = minH(rec);
    const ok = { action: TEXT.none, highlight: null };
    if (h == null) return { action: '', highlight: null };
    if (rec.obstacle === 'Overhead Structure') return h < r.min ? { action: TEXT.structure, highlight: 'red' } : ok;
    if (rec.obstacle === 'Overhead Cable') {
      const c = lineClass(rec.fields && rec.fields.type);
      if (c === 'HV') return h < r.HV ? { action: TEXT.hvOff, highlight: 'purple' } : ok;
      if (c === 'MV') return h < r.MV ? { action: TEXT.mvOff, highlight: 'magenta' } : ok;
      if (h < r.min) return { action: TEXT.lvLift, highlight: 'yellow' };
      if (h < r.LV) return { action: TEXT.lvOff, highlight: 'yellow' };
      return ok;
    }
    return { action: '', highlight: null };
  }
  /* colour used in the report: the user's choice wins ('none' = explicitly no colour), otherwise the automatic one */
  function highlightOf(rec, settings) {
    if (rec.highlight === 'none') return null;
    if (COLORS.includes(rec.highlight)) return rec.highlight;
    return suggest(rec, settings).highlight;
  }
  g.SurveyRules = { COLORS, DEFAULTS, TEXT, refs, suggest, highlightOf, lineClass };
  if (typeof module !== 'undefined') module.exports = g.SurveyRules;
})(typeof window !== 'undefined' ? window : globalThis);

/* Survey layout ("etüt düzeni"): obstacle types with their shown names, sub-types, inputs and standard remarks.
   Built-in types keep a fixed key (the rules and the report rely on it); only what is shown changes.
   Kept in the settings ('layout'); exported / imported as a text file (JSON) to use the same layout on another device. */
(function (g) {
  'use strict';
  const R = g.SurveyRules;
  const TYPES = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn',
    'Inclination', 'Declination', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate', 'Satellite View', 'Drone View'];
  const QUICK = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'Inclination', 'Declination'];
  /* which inputs each type opens with (team's list, 18.11.2026); any type can still add H or W by hand */
  const H_TYPES = ['Overhead Cable', 'Overhead Structure', 'Railroad Crossing', 'Port Gate'];
  const WIDTH_TYPES = ['Overhead Structure', 'Bridge', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate'];
  const CURVES = ['Right-hand curve. The available turning radius accommodates the swept path of the planned transport configuration.', 'Left-hand curve. The available turning radius accommodates the swept path of the planned transport configuration.'];
  const SUB = {
    'Overhead Structure': ['L-Shaped Signboard', 'Signboard', 'Bridge', 'Traffic Enforcement Camera', 'L-Shaped Traffic Light', 'Traffic Light', 'Pedestrian Bridge', 'Pipeline'],
    'Overhead Cable': ['High Voltage Power Line', 'Medium Voltage Power Line', 'Low Voltage Power Line', 'Telephone Line', 'Railway Communication Cable'],
    'Bridge': ['Precast Concrete I Girder', 'Precast Concrete U Girder', 'Concrete T-Beam', 'Concrete Flat Slab', 'Steel I Girder', 'Steel U Girder', 'Concrete Box Girder'],
    'Culvert': ['Box', 'Arc', 'Pipe'],
  };
  // obstacles with a width get one of these automatically when the width is entered (load width known)
  const W_OK = 'Clearance is sufficient for the planned transport configuration. No mitigation required.';
  const W_NO = 'Clearance is insufficient for the planned transport configuration. Mitigation measures are required prior to transport.';
  /* standard comments; each list opens with the app's own, followed by the wording used in the team's past reports
     (Gaziantep–Kahramanmaraş and Best Transformer–İzmir Aliağa, Nov 2026) */
  const PHRASES = {
    'Overhead Cable': [R.TEXT.lvLift, R.TEXT.lvOff, R.TEXT.hvOff, R.TEXT.none,
      'Cable sag height provides sufficient clearance for the planned transport configuration. No mitigation required.',
      'Measured cable height is within the permissible clearance for the planned transport configuration. No mitigation required.'],
    'Overhead Structure': [R.TEXT.structure, 'The structure must be temporarily removed or bypassed prior to the passage of the convoy.', 'Passage via the right-hand lane. Sufficient clearance available; no mitigation required.', 'Passage via the left-hand lane. Sufficient clearance available; no mitigation required.', R.TEXT.none,
      'Vertical and lateral clearances of the opposing L-shaped traffic signal gantries are sufficient for the planned transport configuration.',
      'Vertical clearance of the opposing L-shaped traffic signal gantries is sufficient for the planned transport configuration.',
      'Lateral clearance between the opposing L-shaped traffic signal gantries is sufficient for the planned transport configuration.',
      'Lateral clearance on the right-hand side of the L-shaped traffic signal gantry is sufficient for the passage of the convoy.',
      'Clearance between the L-shaped traffic signal gantries is sufficient for the passage of the convoy. No mitigation required.',
      'Vertical clearance of the traffic signals is sufficient for the planned transport configuration. No mitigation required.',
      'The signboard must be temporarily dismantled prior to the passage of the convoy and reinstated afterwards.'],
    'Bridge': ['A structural assessment and static load analysis of the bridge are required prior to transport.',
      'Major structural cracks observed. A detailed structural assessment and static load analysis of the bridge are mandatory prior to transport.',
      'Minor surface cracks observed. A structural assessment and static load analysis of the bridge are required prior to transport.', 'The bridge is in good structural condition with no visible defects.',
      'A new bridge is under construction along the route. The final vertical clearance is not yet known and must be verified prior to transport.'],
    'Culvert': ['The culvert is in good structural condition with no visible defects.', 'A structural assessment and static load analysis of the bridge are required prior to transport.'],
    'Left Turn': ['Left turn.', 'Left turn. The available turning radius accommodates the swept path of the planned transport configuration.', 'Left turn. The available turning radius does not accommodate the swept path of the planned transport configuration; geometric mitigation is required.', 'The convoy must use the opposing carriageway; temporary traffic management is required.',
      'Left turn; take the second exit at the roundabout.', 'Left turn via the roundabout.', 'Left turn; exit the motorway.'],
    'Right Turn': ['Right turn.', 'Right turn. The available turning radius accommodates the swept path of the planned transport configuration.', 'Right turn. The available turning radius does not accommodate the swept path of the planned transport configuration; geometric mitigation is required.', 'The convoy must use the opposing carriageway; temporary traffic management is required.',
      'Right turn. The junction geometry is suitable for the planned transport configuration.', 'The concrete blocks must be temporarily removed to provide the required swept path for the right turn.', 'Right turn upon exiting the factory.', 'Right turn at the roundabout onto the motorway.'],
    'Curve': ['Left-hand curve. No mitigation required.', 'Right-hand curve. No mitigation required.', 'S-bend.', 'S-bend. The available turning radii accommodate the swept path of the planned transport configuration.'],
    'U Turn': ['U-turn. The available turning radius accommodates the swept path of the planned transport configuration.', 'The U-turn geometry is suitable for the planned transport configuration.', 'U-turn.', 'U-turn via the roundabout.'],
    'Roundabout Turn': ['Proceed straight ahead at the roundabout.', 'Take the second exit at the roundabout.', 'Entry to the roundabout.'],
    'Inclination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `Uphill gradient of approximately ${n} %. Tractive capacity must be verified for the gross combination weight.`).concat('Uphill gradient of approximately %. Tractive capacity must be verified for the gross combination weight.'),
    'Declination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `Downhill gradient of approximately ${n} %. Braking capacity must be verified for the gross combination weight.`).concat('Downhill gradient of approximately %. Braking capacity must be verified for the gross combination weight.'),
    'Road Condition': ['The road surface is in poor condition; minor civil works are required prior to transport.', 'The convoy must use the opposing carriageway; temporary traffic management is required.',
      'The road surface is in good condition. No mitigation required.', 'No mitigation required.',
      'The carriageway narrows to a single lane due to roadworks.', 'Due to ongoing roadworks, the carriageway narrows to a single lane.', 'The carriageway narrows to a single lane.',
      'Roadworks completed; the carriageway returns to two lanes.', 'Roadworks completed.', 'Start of roadworks.',
      'Start of roadworks. The traffic cones will be temporarily removed to allow the convoy to proceed along the planned route.', 'The traffic cones will be temporarily removed.',
      'Roadworks ahead; passage via the right-hand lane.', 'Passage via the left-hand lane is required.', 'The convoy proceeds against the normal direction of traffic under traffic management.',
      'The road becomes a single carriageway with one lane in each direction.', 'The road becomes a dual carriageway with two lanes in each direction.',
      'Junction with the main road.', 'Return to the main road.', 'Security checkpoint. No mitigation required.',
      'Tree branches encroach on the clearance envelope in some sections; vegetation trimming is required.', 'Automatic barrier; to be opened during the passage of the convoy.', 'Concrete barriers; temporary removal may be required.',
      'A new bridge is under construction along the route. The final vertical clearance is not yet known and must be verified prior to transport.',
      'The road is not suitable for the planned transport configuration. The road must be widened up to the main road junction, including filling and compaction works.'],
    'Width Obstruction': [W_OK, W_NO, 'Clearance is sufficient for the passage of the convoy.'],
    'Railroad Crossing': ['The level crossing must be coordinated with the railway operator according to the train timetable.'],
    'Port Gate': [W_OK, W_NO, 'Port gate entrance.', 'The factory gate width is sufficient for the planned transport configuration.', 'The gate dimensions are sufficient for the planned transport configuration.',
      'The jobsite gate is not suitable for the planned transport configuration. The gate must be widened prior to transport.', 'Exit from the jobsite gate towards the opposite direction.', 'Terminal gate entrance.', 'Cargo offloading area.'],
    'Satellite View': ['Satellite view of the swept-path simulation.'],
    'Drone View': ['Drone view of the swept-path simulation.'],
  };
  for (const k of Object.keys(PHRASES)) if (!['Satellite View', 'Drone View'].includes(k) && !PHRASES[k].some(t => /^no (action|mitigation) required\.?$/i.test(t))) PHRASES[k].push('No mitigation required.');

  const SUBLABEL = { 'Overhead Cable': 'Line Type', 'Overhead Structure': 'Structure Type', 'Bridge': 'Bridge Type', 'Culvert': 'Culvert Type' };
  /* 23.11.2026 text revision: shown names and phrases renamed by the team; built-in keys stay (rules and records use them).
     Layouts saved before (version < 3) take the new wording wherever they still had the old default. */
  const LABELS = {"Railroad Crossing": "Level Crossing"};
  const REPHRASE = { "Right curve. Turning radius of the curve is suitable for planned transportation operation.": "Right-hand curve. The available turning radius accommodates the swept path of the planned transport configuration.", "Left curve. Turning radius of the curve is suitable for planned transportation operation.": "Left-hand curve. The available turning radius accommodates the swept path of the planned transport configuration.", "L Shape Signboard": "L-Shaped Signboard", "L Shape Traffic Light": "L-Shaped Traffic Light", "High Voltage Powerline": "High Voltage Power Line", "Medium Voltage Powerline": "Medium Voltage Power Line", "Low Voltage Powerline": "Low Voltage Power Line", "Railroad Communication Cable": "Railway Communication Cable", "Concrete Tee Beam": "Concrete T-Beam", "The clearance is sufficient for planned transportation operation. No action required.": "Clearance is sufficient for the planned transport configuration. No mitigation required.", "The clearance is not sufficient for planned transportation operation.": "Clearance is insufficient for the planned transport configuration. Mitigation measures are required prior to transport.", "Cable height is enough for planned transportation operation. No action required.": "Cable sag height provides sufficient clearance for the planned transport configuration. No mitigation required.", "The height of the cables is suitable for the planned operation. No action required.": "Measured cable height is within the permissible clearance for the planned transport configuration. No mitigation required.", "Structure must be removed/bypassed.": "The structure must be temporarily removed or bypassed prior to the passage of the convoy.", "Use right lane to pass. No action required.": "Passage via the right-hand lane. Sufficient clearance available; no mitigation required.", "Use left lane to pass. No action required.": "Passage via the left-hand lane. Sufficient clearance available; no mitigation required.", "The heights and widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.": "Vertical and lateral clearances of the opposing L-shaped traffic signal gantries are sufficient for the planned transport configuration.", "The heights of the opposing L-shaped traffic lights are suitable for the planned transportation operation.": "Vertical clearance of the opposing L-shaped traffic signal gantries is sufficient for the planned transport configuration.", "The widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.": "Lateral clearance between the opposing L-shaped traffic signal gantries is sufficient for the planned transport configuration.", "The clearance on the right side of the L-shape traffic light is enough for transportation.": "Lateral clearance on the right-hand side of the L-shaped traffic signal gantry is sufficient for the passage of the convoy.", "The clearance between the L-shape traffic lights is enough for transportation. No action required.": "Clearance between the L-shaped traffic signal gantries is sufficient for the passage of the convoy. No mitigation required.", "The height of the traffic lights is suitable for the planned operation. No action required.": "Vertical clearance of the traffic signals is sufficient for the planned transport configuration. No mitigation required.", "Signboard must be removed.": "The signboard must be temporarily dismantled prior to the passage of the convoy and reinstated afterwards.", "Bridge static analysis and evaluation is required.": "A structural assessment and static load analysis of the bridge are required prior to transport.", "Bridge static analysis and evaluation is required. Major cracks observed.": "Major structural cracks observed. A detailed structural assessment and static load analysis of the bridge are mandatory prior to transport.", "Bridge static analysis and evaluation is required. Minor cracks observed.": "Minor surface cracks observed. A structural assessment and static load analysis of the bridge are required prior to transport.", "The bridge is in good condition.": "The bridge is in good structural condition with no visible defects.", "Construction of a new bridge has commenced along the route. The height of bridge is currently unknown.": "A new bridge is under construction along the route. The final vertical clearance is not yet known and must be verified prior to transport.", "The culvert is good condition.": "The culvert is in good structural condition with no visible defects.", "Turn left.": "Left turn.", "Turn left. Turning radius of the turn is suitable for planned transportation operation.": "Left turn. The available turning radius accommodates the swept path of the planned transport configuration.", "Turn left. Turning radius of the turn is not suitable for planned transportation operation.": "Left turn. The available turning radius does not accommodate the swept path of the planned transport configuration; geometric mitigation is required.", "The opposite traffic direction must be used.": "The convoy must use the opposing carriageway; temporary traffic management is required.", "Turn left and take the second exit at the roundabout.": "Left turn; take the second exit at the roundabout.", "Turn left by roundabout turn.": "Left turn via the roundabout.", "Turn left and exit the freeway.": "Left turn; exit the motorway.", "Turn right.": "Right turn.", "Turn right. Turning radius of the turn is suitable for planned transportation operation.": "Right turn. The available turning radius accommodates the swept path of the planned transport configuration.", "Turn right. Turning radius of the turn is not suitable for planned transportation operation.": "Right turn. The available turning radius does not accommodate the swept path of the planned transport configuration; geometric mitigation is required.", "Turn right. The turn is suitable for planned transportation operation.": "Right turn. The junction geometry is suitable for the planned transport configuration.", "Concrete blocks must be removed for the right turn.": "The concrete blocks must be temporarily removed to provide the required swept path for the right turn.", "Turn right after exit of factory.": "Right turn upon exiting the factory.", "Turn right at the roundabout and enter the freeway.": "Right turn at the roundabout onto the motorway.", "Left curve. No action required.": "Left-hand curve. No mitigation required.", "Right curve. No action required.": "Right-hand curve. No mitigation required.", "S Turn.": "S-bend.", "S Turn. Turning radius is suitable for transportation.": "S-bend. The available turning radii accommodate the swept path of the planned transport configuration.", "U turn. Turning radius of the turn is suitable for planned transportation operation.": "U-turn. The available turning radius accommodates the swept path of the planned transport configuration.", "U - Turn is suitable for the planned transportation operation.": "The U-turn geometry is suitable for the planned transport configuration.", "U turn.": "U-turn.", "U Turn by roundabout turn.": "U-turn via the roundabout.", "Continue straight at the roundabout.": "Proceed straight ahead at the roundabout.", "Enter the roundabout.": "Entry to the roundabout.", "The degree of the inclination is about %.": "Uphill gradient of approximately %. Tractive capacity must be verified for the gross combination weight.", "The degree of the declination is about %.": "Downhill gradient of approximately %. Braking capacity must be verified for the gross combination weight.", "The road is in poor condition and requires minor civil works.": "The road surface is in poor condition; minor civil works are required prior to transport.", "Road is good condition. No action required.": "The road surface is in good condition. No mitigation required.", "No action required.": "No mitigation required.", "The road narrows to a single lane due to roadworks.": "The carriageway narrows to a single lane due to roadworks.", "Due to ongoing roadworks, the road narrows to a single lane.": "Due to ongoing roadworks, the carriageway narrows to a single lane.", "The road is reduced to a single lane.": "The carriageway narrows to a single lane.", "The road returns to two lanes as the roadworks have been completed.": "Roadworks completed; the carriageway returns to two lanes.", "Roadworks have been completed.": "Roadworks completed.", "Start of road works at this point.": "Start of roadworks.", "Start of roadworks at this point. The traffic cones will be removed to allow the transport convoy to proceed along the planned route.": "Start of roadworks. The traffic cones will be temporarily removed to allow the convoy to proceed along the planned route.", "The traffic cones will be removed.": "The traffic cones will be temporarily removed.", "Roadworks ahead, use the right lane.": "Roadworks ahead; passage via the right-hand lane.", "Left lane must be used.": "Passage via the left-hand lane is required.", "Move on the opposite direction.": "The convoy proceeds against the normal direction of traffic under traffic management.", "The road has become a single carriageway with one lane in each direction.": "The road becomes a single carriageway with one lane in each direction.", "The road has become a dual carriageway with two lanes in each direction.": "The road becomes a dual carriageway with two lanes in each direction.", "Connect to the main road.": "Junction with the main road.", "Back onto the main road.": "Return to the main road.", "Security check point. No action required.": "Security checkpoint. No mitigation required.", "Trees are extending into the roadway in some sections.": "Tree branches encroach on the clearance envelope in some sections; vegetation trimming is required.", "Automatic barrier.": "Automatic barrier; to be opened during the passage of the convoy.", "Concrete barriers.": "Concrete barriers; temporary removal may be required.", "The road condition is not suitable for the planned operation. The road must be widened up to the main road connection, and filling and compaction work must be carried out.": "The road is not suitable for the planned transport configuration. The road must be widened up to the main road junction, including filling and compaction works.", "The clearance is sufficient for transport.": "Clearance is sufficient for the passage of the convoy.", "Railroad crossing must be organized based on the train schedule.": "The level crossing must be coordinated with the railway operator according to the train timetable.", "Entrance of the port gate.": "Port gate entrance.", "Width of factory gate is suitable for planned transportation operation.": "The factory gate width is sufficient for the planned transport configuration.", "Gate dimensions is suitable for planned transportation operation.": "The gate dimensions are sufficient for the planned transport configuration.", "Jobsite Gate is not suitable for planned transportation operation. Gate must be widened.": "The jobsite gate is not suitable for the planned transport configuration. The gate must be widened prior to transport.", "Exit of the jobsite gate to the opposite direction.": "Exit from the jobsite gate towards the opposite direction.", "Cargo unloading area.": "Cargo offloading area.", "Satellite view of transportation simulation.": "Satellite view of the swept-path simulation.", "Drone view of transportation simulation.": "Drone view of the swept-path simulation.", "Dosya okunamadı (etüt düzeni değil)": "Dosya okunamadı (bu bir etüt düzeni dosyası değil).", "Bu dosya bir etüt düzeni değil": "Bu dosya bir etüt düzeni dosyası değil." };
  const rephrase = p => {
    if (REPHRASE[p]) return REPHRASE[p];
    const g = /^The degree of the (in|de)clination is about (\d*)\s?%\.$/.exec(p);
    if (g) return g[1] === 'in' ? `Uphill gradient of approximately ${g[2]}${g[2] ? ' ' : ''}%. Tractive capacity must be verified for the gross combination weight.` : `Downhill gradient of approximately ${g[2]}${g[2] ? ' ' : ''}%. Braking capacity must be verified for the gross combination weight.`;
    return p;
  };
  const FORMAT = 'route-survey-layout';
  function defaults() {
    return {
      format: FORMAT, version: 3, name: 'Standart',
      heightLabels: ['H', 'H1', 'H2', 'H3', 'HL', 'HM', 'HR'], widthLabels: ['W', 'W1', 'W2', 'W3'],
      types: TYPES.map(k => ({
        key: k, label: LABELS[k] || k, builtin: true, hidden: false, quick: QUICK.includes(k),
        heights: H_TYPES.includes(k), widths: WIDTH_TYPES.includes(k),
        subLabel: SUBLABEL[k] || 'Type', sub: (SUB[k] || []).slice(),
        nameField: k === 'Bridge' ? 'Bridge Name' : '', spansField: k === 'Bridge' || k === 'Culvert' ? 'Spans' : '',
        phrases: (PHRASES[k] || []).slice(),
      })),
    };
  }
  const str = v => String(v == null ? '' : v).trim();
  const lines = v => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map(str).filter(Boolean);   // one per line (commas allowed)
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/\r?\n|,/)).map(str).filter(Boolean);
  /* fill gaps, drop junk; built-in types that are missing come back (hidden types stay hidden) */
  function normalize(L) {
    const d = defaults();
    if (!L || typeof L !== 'object' || !Array.isArray(L.types)) return d;
    const byKey = Object.fromEntries(d.types.map(t => [t.key, t])), seen = new Set(), types = [];
    for (const t of L.types) {
      const key = str(t && (t.key || t.label)); if (!key || seen.has(key)) continue; seen.add(key);
      const base = byKey[key] || { key, label: key, builtin: false, hidden: false, quick: false, heights: true, widths: true, subLabel: 'Type', sub: [], nameField: '', spansField: '', phrases: [] };
      types.push({
        key, label: byKey[key] && !(L.version >= 3) && (!str(t.label) || str(t.label) === key) ? base.label : (str(t.label) || base.label), builtin: !!byKey[key], hidden: !!t.hidden, quick: !!t.quick,
        // layouts saved before version 2 take the new H/W defaults for built-in types
        heights: byKey[key] && !(L.version >= 2) ? base.heights : !!t.heights, widths: byKey[key] && !(L.version >= 2) ? base.widths : !!t.widths, subLabel: str(t.subLabel) || base.subLabel,
        sub: t.sub != null ? lines(t.sub).map(x => L.version >= 3 ? x : rephrase(x)) : base.sub, nameField: t.nameField != null ? str(t.nameField) : base.nameField,
        spansField: t.spansField != null ? str(t.spansField) : base.spansField, phrases: t.phrases != null ? lines(t.phrases).map(x => L.version >= 3 ? x : rephrase(x)) : base.phrases,
      });
    }
    for (const t of d.types) if (!seen.has(t.key)) types.push(t);
    return { format: FORMAT, version: 3, name: str(L.name) || 'Özel şablon',
      heightLabels: L.heightLabels ? list(L.heightLabels) : d.heightLabels, widthLabels: L.widthLabels ? list(L.widthLabels) : d.widthLabels, types };
  }
  let CUR = defaults();
  const api = {
    FORMAT, W_OK, W_NO, CURVES, defaults, normalize,
    get: () => CUR,
    async load() { try { const s = await g.DB.getSetting('layout'); CUR = normalize(s || null); } catch (e) { CUR = defaults(); } return CUR; },
    async save(L) { CUR = normalize(L); await g.DB.setSetting('layout', CUR); return CUR; },
    setNow(L) { CUR = normalize(L); return CUR; },   // in memory right away; save() writes it
    def: k => CUR.types.find(t => t.key === k) || null,
    label: k => { const t = CUR.types.find(x => x.key === k); return t ? t.label : (k || ''); },
    toText: L => JSON.stringify(Object.assign({ format: FORMAT, version: 1, exportedAt: new Date().toISOString() }, normalize(L)), null, 2),
    fromText(txt) {
      let o; try { o = JSON.parse(String(txt).replace(/^\uFEFF/, '')); } catch (e) { throw new Error('Dosya okunamadı (bu bir etüt düzeni dosyası değil).'); }
      if (!o || o.format !== FORMAT || !Array.isArray(o.types)) throw new Error('Bu dosya bir etüt düzeni dosyası değil.');
      return normalize(o);
    },
  };
  g.Catalog = api;
  g.OL = k => api.label(k);
})(window);

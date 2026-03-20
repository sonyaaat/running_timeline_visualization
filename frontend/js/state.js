const APP_STATE = {
  // Raw data from phases.json
  phases:      [],    // all phases (Active + Inactive)
  weekly:      [],    // weekly records with phase_id
  breakpoints: [],    // transition cards between active phases
  meta:        {},    // date_start, date_end, has_hr, total_weeks

  // UI state
  selectedPhaseId:   null,  // which phase is clicked in zoom view
  zoomRange:         null,  // { weekStart, weekEnd } — current drag selection
  hasZoom:           false, // whether zoom view is visible
};

export default APP_STATE;

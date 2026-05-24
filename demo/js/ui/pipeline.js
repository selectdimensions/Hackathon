// PipelineUI — the schematic "BladeRF → Pi → ESP32-C6 → LoRa → Master →
// Soldier" flow shown above the map. Stages light up as events fire.

(function (root) {
  const STAGES = [
    { id: 'blade',   label: 'BladeRF\n5.8 GHz' },
    { id: 'pi',      label: 'Raspberry Pi' },
    { id: 'esp',     label: 'ESP32-C6\nSX1262' },
    { id: 'lora_u',  label: 'LoRa 868.1\nDetectPkt' },
    { id: 'master',  label: 'Master\nTDOA/RSSI' },
    { id: 'lora_d',  label: 'LoRa 868.3\nAlertPkt' },
    { id: 'soldier', label: 'Soldier\nI2S DAC' },
  ];

  function makePipelineUI(containerId) {
    const root = document.getElementById(containerId);
    root.innerHTML = '';
    const cells = {};
    STAGES.forEach((s, i) => {
      const cell = document.createElement('div');
      cell.className = 'pipe-cell';
      cell.dataset.id = s.id;
      cell.innerHTML = `<div class="pipe-box"><span class="pipe-label">${s.label.replace('\n', '<br>')}</span></div>`;
      root.appendChild(cell);
      cells[s.id] = cell;
      if (i < STAGES.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'pipe-arrow';
        arrow.textContent = '▶';
        root.appendChild(arrow);
      }
    });

    function flash(id, color) {
      const c = cells[id];
      if (!c) return;
      c.classList.remove('flash-detect', 'flash-alert', 'flash-err');
      void c.offsetWidth;
      c.classList.add(color || 'flash-detect');
      setTimeout(() => c.classList.remove(color || 'flash-detect'), 900);
    }

    function onDetect(ev) {
      // light up sensor side
      if (ev._is_live) flash('blade'), flash('pi'), flash('esp');
      flash('lora_u', 'flash-detect');
    }
    function onAlert(ev) {
      flash('master', 'flash-alert');
      setTimeout(() => flash('lora_d', 'flash-alert'), 120);
      setTimeout(() => flash('soldier', 'flash-alert'), 240);
    }
    function reset() {
      Object.values(cells).forEach(c => c.classList.remove('flash-detect', 'flash-alert', 'flash-err'));
    }

    return { onDetect, onAlert, reset };
  }

  root.UI = root.UI || {};
  root.UI.makePipelineUI = makePipelineUI;
})(window);

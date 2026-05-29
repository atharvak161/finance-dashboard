// Shared chart theme — JARVIS / Grafana palette
// Import in every page module to keep all charts consistent

export const C = {
  grid:     'rgba(0,191,255,0.07)',
  tick:     '#3d5473',
  info:     '#00bfff',
  positive: '#00e676',
  negative: '#ff1744',
  warning:  '#ff9100',
  purple:   '#d500f9',
  yellow:   '#ffd600',
  teal:     '#00e5ff',
  cyan:     '#18ffff',
  chart: ['#00bfff','#00e676','#ffd600','#ff9100','#ff1744','#d500f9','#00e5ff','#18ffff'],
};

export const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 800, easing: 'easeInOutQuart' },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(9,12,20,0.96)',
      borderColor: 'rgba(0,191,255,0.25)',
      borderWidth: 1,
      titleColor: '#00bfff',
      bodyColor: '#8099b3',
      padding: 12,
      cornerRadius: 6,
    },
  },
  scales: {
    x: {
      grid:  { color: 'rgba(0,191,255,0.07)', drawBorder: false },
      ticks: { color: '#3d5473', font: { size: 11 } },
    },
    y: {
      grid:  { color: 'rgba(0,191,255,0.07)', drawBorder: false },
      ticks: { color: '#3d5473', font: { size: 11 } },
    },
  },
};

export function getCtxAndDestroy(id, store) {
  if (store[id]) { store[id].destroy(); delete store[id]; }
  return document.getElementById(id)?.getContext('2d') || null;
}

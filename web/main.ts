// Entrada de la página. Por ahora sólo muestra la vista que corresponde (la lógica completa del lobby está en curso).
const vista = /^#[A-Z0-9]{6}$/i.test(location.hash) ? 'join-view' : 'home-view';
document.getElementById(vista)!.hidden = false;
if (vista === 'join-view') document.getElementById('join-code')!.textContent = location.hash.slice(1).toUpperCase();
const mapa = document.getElementById('map') as HTMLSelectElement;
mapa.add(new Option('campgrounds', 'campgrounds'));
const modo = document.getElementById('gametype') as HTMLSelectElement;
for (const [v, t] of [['0', 'Free For All'], ['1', 'Duel'], ['3', 'Team Deathmatch'], ['4', 'Clan Arena'], ['5', 'Capture The Flag']]) modo.add(new Option(t, v));
const maximos = document.getElementById('max-players') as HTMLSelectElement;
for (const n of [2, 4, 8, 12, 16]) maximos.add(new Option(String(n), String(n), n === 8, n === 8));

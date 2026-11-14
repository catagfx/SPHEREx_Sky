// Save generated data as a file (catalog / discovery report JSON).
export function downloadJson(data, filename) {
  const a = document.createElement('a');
  a.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2)));
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

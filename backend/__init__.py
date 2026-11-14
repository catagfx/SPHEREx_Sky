"""SPHEREx Sky backend: serves the site and the IRSA cutout / FITS telemetry API (see http_server.py).

  config.py       paths, .env, bundled benchmark targets
  state.py        in-memory jobs + rate limiter
  coords.py       coordinate parsing / formatting
  irsa.py         IRSA TAP queries, HTTP byte-range FITS cutouts
  telemetry.py    FITS archive telemetry for the viewer
  synthetic.py    opt-in illustrative simulation (clearly labeled)
  render.py       FITS -> JPEGs, blink GIF, difference map
  report.py       HTML / text report
  mailer.py       SMTP settings + delivery
  jobs.py         the cutout job pipeline
  http_server.py  routes + server
"""

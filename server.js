'use strict';
const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { execFile } = require('child_process');
const { generateResumenEjecutivo } = require('./docGenerator');

const PORT = process.env.PORT || 8080;

// Ruta al binario de LibreOffice según entorno
function getSofficePath() {
  const absolute = [
    '/opt/homebrew/Caskroom/libreoffice/26.2.2/LibreOffice.app/Contents/MacOS/soffice', // Mac ARM Homebrew
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',                             // Mac instalación directa
  ];
  for (const p of absolute) {
    if (fs.existsSync(p)) return p;
  }
  // Railway/Linux: intentar 'soffice' primero (nombre Nix), luego 'libreoffice'
  return 'soffice';
}
const SOFFICE = getSofficePath();

// ── Helpers ────────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `montpalm_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

// Convierte un buffer .docx a PDF usando LibreOffice headless
// Devuelve una Promise<Buffer> con el PDF
function docxToPdf(docxBuffer) {
  return new Promise((resolve, reject) => {
    const docxPath = tmpFile('.docx');
    const outDir   = os.tmpdir();

    fs.writeFileSync(docxPath, docxBuffer);

    // Directorio de perfil temporal para entornos containerizados (Railway/Docker)
    const profileDir = path.join(os.tmpdir(), `lo_profile_${Date.now()}`);

    execFile(
      SOFFICE,
      [
        `-env:UserInstallation=file://${profileDir}`,
        '--headless',
        '--norestore',
        '--convert-to', 'pdf',
        '--outdir', outDir,
        docxPath,
      ],
      { timeout: 60000 },
      (err, stdout, stderr) => {
        // Limpiar el .docx temporal y el perfil siempre
        try { fs.unlinkSync(docxPath); } catch (_) {}
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}

        if (err) {
          console.error('[LibreOffice stderr]', stderr);
          console.error('[LibreOffice err]', err.message);
          return reject(new Error('LibreOffice error: ' + (stderr || err.message)));
        }

        // LibreOffice crea el PDF con el mismo nombre base
        const pdfPath = path.join(outDir, path.basename(docxPath, '.docx') + '.pdf');
        if (!fs.existsSync(pdfPath)) {
          return reject(new Error('PDF no generado por LibreOffice'));
        }

        const pdfBuffer = fs.readFileSync(pdfPath);
        try { fs.unlinkSync(pdfPath); } catch (_) {}
        resolve(pdfBuffer);
      }
    );
  });
}

// ── Diagnóstico LibreOffice ────────────────────────────────────────────────────
const { execSync } = require('child_process');

function checkLibreOffice() {
  const candidates = ['soffice', 'libreoffice'];
  for (const bin of candidates) {
    try {
      const out = execSync(`${bin} --version 2>&1`, { timeout: 10000 }).toString().trim();
      return { ok: true, bin, version: out };
    } catch (_) {}
  }
  // También buscar en rutas Nix comunes
  try {
    const which = execSync('which soffice || which libreoffice || find /nix -name soffice -type f 2>/dev/null | head -1', { timeout: 5000 }).toString().trim();
    return { ok: false, bin: SOFFICE, which };
  } catch (e) {
    return { ok: false, bin: SOFFICE, error: e.message };
  }
}

// ── Servidor ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── GET /health → diagnóstico LibreOffice ──────────────────────────────────
  if (req.method === 'GET' && urlPath === '/health') {
    const info = checkLibreOffice();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ soffice_path: SOFFICE, libreoffice: info }, null, 2));
    return;
  }

  // ── POST /generate → devuelve .docx ────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/generate') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const buffer = await generateResumenEjecutivo(data);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Resumen_Ejecutivo.docx"',
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (e) {
      console.error('[/generate]', e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── POST /generate-pdf → devuelve .pdf ─────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/generate-pdf') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const docxBuffer = await generateResumenEjecutivo(data);
      const pdfBuffer  = await docxToPdf(docxBuffer);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Resumen_Ejecutivo.pdf"',
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (e) {
      console.error('[/generate-pdf]', e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── GET → sirve archivos HTML estáticos ────────────────────────────────────
  const url      = urlPath === '/' ? '/index.html' : urlPath;
  const filename = url.replace(/^\//, '');

  if (!filename.endsWith('.html')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const filepath = path.join(__dirname, filename);
  if (fs.existsSync(filepath)) {
    const html = fs.readFileSync(filepath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Montpalm server corriendo en http://localhost:${PORT}`);
  console.log(`LibreOffice: ${SOFFICE}`);
});

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // Rota principal - servir o player HTML
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'test-player.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading HTML file');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }
    // Servir arquivos de áudio
    else if (req.url.endsWith('.mp3') || req.url.endsWith('.wav') || req.url.endsWith('.ogg')) {
        const filePath = path.join(__dirname, req.url);
        fs.exists(filePath, (exists) => {
            if (!exists) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            
            if (range) {
                // Suporte a streaming para áudio
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*'
                });
                file.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*'
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
    }
    // Servir outros arquivos estáticos
    else {
        const filePath = path.join(__dirname, req.url);
        fs.exists(filePath, (exists) => {
            if (!exists) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            const ext = path.extname(filePath);
            const contentTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg'
            };
            
            res.writeHead(200, {
                'Content-Type': contentTypes[ext] || 'text/plain',
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
        });
    }
});

server.listen(PORT, () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
    console.log(`🎵 Carregue o player HTML no seu navegador!`);
    console.log(`📁 Arquivo disponível: teste.mp3`);
});


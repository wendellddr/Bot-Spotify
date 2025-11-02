const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3001;

// Cache simples para resultados
const cache = {};

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // Servir HTML principal
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'youtube-test.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading HTML');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }
    // API para buscar vídeo do YouTube
    else if (req.url.startsWith('/api/search?url=')) {
        const url = decodeURIComponent(req.url.split('url=')[1]);
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        
        // Verificar cache
        if (cache[url]) {
            res.end(JSON.stringify(cache[url]));
            return;
        }
        
        try {
            // Buscar informações do vídeo com yt-dlp
            const info = await getVideoInfo(url);
            
            // Salvar no cache
            cache[url] = info;
            
            res.end(JSON.stringify(info));
        } catch (error) {
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }
    // API para obter stream URL
    else if (req.url.startsWith('/api/stream?url=')) {
        const url = decodeURIComponent(req.url.split('url=')[1]);
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        
        try {
            const streamUrl = await getStreamUrl(url);
            res.end(JSON.stringify({
                success: true,
                url: streamUrl
            }));
        } catch (error) {
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }
    // Servir arquivos estáticos
    else {
        const filePath = path.join(__dirname, req.url);
        fs.exists(filePath, (exists) => {
            if (!exists) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
        });
    }
});

function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        console.log('📹 Buscando informações do vídeo:', url);
        
        const ytdlp = spawn('yt-dlp', [
            '--dump-json',
            '--no-playlist',
            url
        ]);
        
        let output = '';
        
        ytdlp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        ytdlp.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(output);
                    console.log('✅ Vídeo encontrado:', info.title);
                    resolve({
                        success: true,
                        title: info.title,
                        uploader: info.uploader,
                        duration: info.duration,
                        thumbnail: info.thumbnail,
                        view_count: info.view_count
                    });
                } catch (error) {
                    reject(new Error('Erro ao parsear JSON'));
                }
            } else {
                reject(new Error(`yt-dlp exited with code ${code}`));
            }
        });
        
        ytdlp.on('error', (error) => {
            reject(new Error(`yt-dlp não encontrado: ${error.message}`));
        });
    });
}

function getStreamUrl(url) {
    return new Promise((resolve, reject) => {
        console.log('🎵 Obtendo URL do stream:', url);
        
        const ytdlp = spawn('yt-dlp', [
            '-f', 'bestaudio/best',
            '-g',
            '--no-playlist',
            url
        ]);
        
        let streamUrl = '';
        
        ytdlp.stdout.on('data', (data) => {
            streamUrl += data.toString().trim();
        });
        
        ytdlp.on('close', (code) => {
            if (code === 0 && streamUrl) {
                console.log('✅ Stream URL obtida');
                resolve(streamUrl);
            } else {
                reject(new Error(`yt-dlp failed with code ${code}`));
            }
        });
        
        ytdlp.on('error', (error) => {
            reject(new Error(`yt-dlp não encontrado: ${error.message}`));
        });
    });
}

server.listen(PORT, () => {
    console.log(`\n✅ Servidor YouTube Test rodando em http://localhost:${PORT}`);
    console.log(`⚠️ Requer yt-dlp instalado no sistema`);
    console.log(`📹 Teste URLs do YouTube no navegador!\n`);
});


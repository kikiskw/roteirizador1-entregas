// =====================================================
// ROTEIRIZADOR DE ENTREGAS - COMPLETO (DeepSeek Edition)
// =====================================================
// ⚠️ ATENÇÃO: Substitua a chave abaixo pela sua chave do OpenRouteService
// Obtenha uma em: https://openrouteservice.org/sign-up/
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjEzMTJjMzFjZjI4NTQxYzlhZmVhY2IxZmMzYTA4YTYwIiwiaCI6Im11cm11cjY0In0='; // <----- TROQUE AQUI

// =====================================================
// CONFIGURAÇÕES E CONSTANTES
// =====================================================
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=';

// Estado do aplicativo
let stops = [];          // { id, address, lat, lon, status, ordem }
let userLocation = null;
let rotaGeometry = null;

// Elementos do mapa
let mapa, camadaRota, marcadoresLayer;

// =====================================================
// PERSISTÊNCIA (localStorage)
// =====================================================
function carregarDados() {
    const data = localStorage.getItem('stops_roteirizador');
    if (data) stops = JSON.parse(data);
    atualizarLista();
    atualizarMarcadores();
    // Se existirem stops, tenta redesenhar a rota (caso tenha localização do usuário)
    if (stops.length > 0 && userLocation) {
        desenharRota([userLocation, ...stops]);
    } else if (stops.length > 1) {
        desenharRota(stops);
    }
}

function salvarDados() {
    localStorage.setItem('stops_roteirizador', JSON.stringify(stops));
}

// =====================================================
// INICIALIZAÇÃO DO MAPA (Leaflet + OpenStreetMap)
// =====================================================
function initMapa() {
    mapa = L.map('map').setView([-15.78, -47.93], 5); // Centro do Brasil
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapa);
    marcadoresLayer = L.layerGroup().addTo(mapa);
    camadaRota = L.polyline([], { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(mapa);
    atualizarMarcadores();
}

function atualizarMarcadores() {
    if (!marcadoresLayer) return;
    marcadoresLayer.clearLayers();
    
    stops.forEach((stop, idx) => {
        if (stop.lat && stop.lon) {
            const marker = L.marker([stop.lat, stop.lon], {
                draggable: false,
                icon: L.divIcon({
                    html: `<div style="background:#3b82f6;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;">${idx+1}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                })
            }).bindPopup(`<b>${idx+1}</b> - ${stop.address}<br><i>Status: ${traduzStatus(stop.status)}</i>`);
            marcadoresLayer.addLayer(marker);
        }
    });
    
    if (userLocation) {
        const userMarker = L.marker([userLocation.lat, userLocation.lon], {
            icon: L.divIcon({
                html: '<div style="background:#10b981;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;">🏠</div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            })
        }).bindPopup('📍 Ponto de partida (sua localização)');
        marcadoresLayer.addLayer(userMarker);
    }
}

async function desenharRota(pontosOrdenados) {
    if (!camadaRota) return;
    if (!pontosOrdenados || pontosOrdenados.length < 2) {
        camadaRota.setLatLngs([]);
        return;
    }
    
    // Garantir que todos os pontos tenham lat/lon
    const pontosValidos = pontosOrdenados.filter(p => p.lat && p.lon);
    if (pontosValidos.length < 2) return;
    
    try {
        const coords = pontosValidos.map(p => [p.lon, p.lat]);
        const body = { coordinates: coords };
        
        const resp = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!resp.ok) {
            const erroTexto = await resp.text();
            throw new Error(`ORS erro ${resp.status}: ${erroTexto}`);
        }
        
        const data = await resp.json();
        const geometry = data.features[0].geometry;
        const latLngs = L.GeoJSON.coordsToLatLngs(geometry.coordinates);
        camadaRota.setLatLngs(latLngs);
        
        // Ajustar a visão do mapa para toda a rota
        const bounds = L.latLngBounds(latLngs);
        mapa.fitBounds(bounds, { padding: [40, 40] });
    } catch (e) {
        console.error('Erro ao desenhar rota:', e);
        alert('Falha ao traçar a rota. Verifique sua chave API do OpenRouteService e se os endereços são válidos.');
    }
}

// =====================================================
// GEOLOCALIZAÇÃO DO USUÁRIO (ponto de partida)
// =====================================================
function obterLocalizacaoUsuario() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject('Geolocalização não suportada pelo seu navegador.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            err => reject('Permita o acesso à localização para definir o ponto de partida.')
        );
    });
}

// =====================================================
// GEOCODIFICAÇÃO (endereço -> coordenadas)
// =====================================================
async function geocodificarEndereco(address) {
    const url = NOMINATIM_URL + encodeURIComponent(address);
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'RoteirizadorDeepSeek/1.0 (contato@exemplo.com)' }
    });
    if (!resp.ok) throw new Error('Falha na comunicação com o serviço de geocodificação.');
    const data = await resp.json();
    if (data.length === 0) throw new Error('Endereço não encontrado. Verifique e tente novamente.');
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// =====================================================
// MODAL DE ADICIONAR ENDEREÇO (com OCR opcional)
// =====================================================
let streamCamera = null;

function abrirAdicionar() {
    document.getElementById('modal-add').style.display = 'flex';
    document.getElementById('endereco-input').value = '';
    document.getElementById('ocr-result').innerText = '';
    document.getElementById('video-container').style.display = 'none';
    pararCamera();
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
    pararCamera();
}

async function iniciarScanner() {
    const container = document.getElementById('video-container');
    container.style.display = 'block';
    try {
        streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.getElementById('video');
        video.srcObject = streamCamera;
        await video.play();
    } catch (e) {
        alert('Não foi possível acessar a câmera. Use a digitação manual.');
        container.style.display = 'none';
    }
}

function pararCamera() {
    if (streamCamera) {
        streamCamera.getTracks().forEach(track => track.stop());
        streamCamera = null;
    }
    const video = document.getElementById('video');
    if (video) video.srcObject = null;
}

function capturarFoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg');
    document.getElementById('ocr-result').innerHTML = '<span class="loader"></span> Reconhecendo texto...';
    
    Tesseract.recognize(imgData, 'por', {
        logger: m => console.log(m) // opcional: ver progresso no console
    })
    .then(({ data: { text } }) => {
        const enderecoDetectado = text.trim();
        document.getElementById('ocr-result').innerText = '📷 Texto detectado: ' + enderecoDetectado;
        document.getElementById('endereco-input').value = enderecoDetectado;
        pararCamera();
        document.getElementById('video-container').style.display = 'none';
    })
    .catch(err => {
        console.error(err);
        document.getElementById('ocr-result').innerText = 'Erro no reconhecimento. Digite manualmente.';
        pararCamera();
        document.getElementById('video-container').style.display = 'none';
    });
}

async function adicionarEndereco() {
    const input = document.getElementById('endereco-input').value.trim();
    if (!input) {
        alert('Digite ou escaneie um endereço antes de adicionar.');
        return;
    }
    
    const btn = event.target;
    btn.disabled = true;
    btn.innerText = '⏳ Geocodificando...';
    
    try {
        const { lat, lon } = await geocodificarEndereco(input);
        stops.push({
            id: Date.now(),
            address: input,
            lat, lon,
            status: 'pendente',
            ordem: stops.length
        });
        salvarDados();
        atualizarLista();
        atualizarMarcadores();
        
        // Redesenha a rota se já tiver ponto de partida
        if (userLocation) {
            await desenharRota([userLocation, ...stops]);
        } else if (stops.length > 1) {
            await desenharRota(stops);
        }
        
        fecharModal('modal-add');
    } catch (e) {
        alert(e.message || 'Erro ao adicionar endereço. Verifique e tente novamente.');
    } finally {
        btn.disabled = false;
        btn.innerText = '✅ Adicionar';
    }
}

// =====================================================
// LISTA DE PARADAS (arrastável com SortableJS)
// =====================================================
function atualizarLista() {
    const container = document.getElementById('lista-stops');
    if (stops.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;">Nenhum pacote adicionado</p>';
        if (camadaRota) camadaRota.setLatLngs([]);
        return;
    }
    
    container.innerHTML = '';
    stops.forEach((stop, idx) => {
        const div = document.createElement('div');
        div.className = 'stop-item';
        div.setAttribute('data-id', stop.id);
        div.innerHTML = `
            <div style="flex:1">
                <strong>${idx+1}.</strong> ${stop.address.substring(0, 50)}${stop.address.length > 50 ? '...' : ''}
                <br><span class="stop-status status-${stop.status}">${traduzStatus(stop.status)}</span>
            </div>
            <div style="display:flex; gap:6px;">
                <select onchange="alterarStatus(${stop.id}, this.value)" style="width:auto;padding:4px;font-size:12px;">
                    <option value="pendente" ${stop.status==='pendente'?'selected':''}>Pendente</option>
                    <option value="entregue" ${stop.status==='entregue'?'selected':''}>Entregue</option>
                    <option value="nao_encontrado" ${stop.status==='nao_encontrado'?'selected':''}>End. não encontrado</option>
                    <option value="pessoa_nao_localizada" ${stop.status==='pessoa_nao_localizada'?'selected':''}>Pessoa não localizada</option>
                    <option value="endereco_errado" ${stop.status==='endereco_errado'?'selected':''}>End. errado</option>
                </select>
                <button class="btn btn-small btn-danger" onclick="removerStop(${stop.id})">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
    
    // Inicializar Sortable (arrastar para reordenar)
    new Sortable(container, {
        animation: 200,
        handle: '.stop-item',
        onEnd: async () => {
            const novaOrdem = Array.from(container.children).map(el => parseInt(el.getAttribute('data-id')));
            stops = novaOrdem.map(id => stops.find(s => s.id === id));
            stops.forEach((s, i) => s.ordem = i);
            salvarDados();
            atualizarMarcadores();
            // Redesenhar rota com a nova ordem
            if (userLocation) {
                await desenharRota([userLocation, ...stops]);
            } else if (stops.length > 1) {
                await desenharRota(stops);
            }
        }
    });
}

function traduzirStatus(status) {
    const mapa = {
        'pendente': 'Pendente',
        'entregue': 'Entregue',
        'nao_encontrado': 'Não encontrado',
        'pessoa_nao_localizada': 'Pessoa não localizada',
        'endereco_errado': 'Endereço errado'
    };
    return mapa[status] || status;
}
window.traduzStatus = traduzirStatus; // para uso no HTML

function alterarStatus(id, novoStatus) {
    const stop = stops.find(s => s.id === id);
    if (stop) {
        stop.status = novoStatus;
        salvarDados();
        atualizarLista();
        // Opcional: mudar cor do marcador? (não implementado para simplicidade)
    }
}

function removerStop(id) {
    stops = stops.filter(s => s.id !== id);
    stops.forEach((s, i) => s.ordem = i);
    salvarDados();
    atualizarLista();
    atualizarMarcadores();
    if (stops.length < 2) {
        camadaRota.setLatLngs([]);
    } else {
        // Redesenha rota
        if (userLocation) desenharRota([userLocation, ...stops]);
        else desenharRota(stops);
    }
}

// =====================================================
// OTIMIZAÇÃO DE ROTA (OpenRouteService Optimization)
// =====================================================
async function otimizarRota() {
    if (stops.length === 0) {
        alert('Adicione pelo menos um endereço para otimizar a rota.');
        return;
    }
    
    // Obter localização do usuário se ainda não tiver
    if (!userLocation) {
        try {
            userLocation = await obterLocalizacaoUsuario();
        } catch (e) {
            alert('Não foi possível obter sua localização. A rota será otimizada sem ponto de partida (iniciando no primeiro endereço).');
            userLocation = { lat: stops[0].lat, lon: stops[0].lon };
        }
    }
    
    const start = userLocation;
    const jobs = stops.map((s, i) => ({
        id: i,
        location: [s.lon, s.lat],
        service: 300 // 5 minutos de parada
    }));
    
    const body = {
        jobs: jobs,
        vehicles: [{
            id: 0,
            profile: 'driving-car',
            start: [start.lon, start.lat],
            end: [start.lon, start.lat]  // retorna ao início
        }]
    };
    
    try {
        const resp = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!resp.ok) {
            const erro = await resp.text();
            throw new Error(erro);
        }
        
        const data = await resp.json();
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const ordemJobs = route.steps.filter(s => s.type === 'job').map(s => s.job);
            // Reordenar stops conforme a ordem otimizada
            const novaOrdem = ordemJobs.map(jobId => stops[jobId]);
            stops = novaOrdem;
            stops.forEach((s, i) => s.ordem = i);
            salvarDados();
            atualizarLista();
            atualizarMarcadores();
            
            // Desenhar a rota geométrica devolvida pela API
            if (route.geometry) {
                const pontosRota = polyline.decode(route.geometry);
                const latLngs = pontosRota.map(([lat, lon]) => [lat, lon]);
                camadaRota.setLatLngs(latLngs);
                const bounds = L.latLngBounds(latLngs);
                mapa.fitBounds(bounds, { padding: [40, 40] });
            } else {
                // fallback: desenha rota simples entre os pontos reordenados
                await desenharRota([userLocation, ...stops]);
            }
            alert('✅ Rota otimizada com sucesso! A ordem da lista foi atualizada.');
        } else {
            alert('Não foi possível otimizar a rota. Tente novamente.');
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao otimizar rota. Verifique sua chave API e se todos os endereços são válidos.');
    }
}

// =====================================================
// RELATÓRIO E EXPORTAÇÃO CSV
// =====================================================
function verRelatorio() {
    const modal = document.getElementById('modal-relatorio');
    const div = document.getElementById('relatorio-conteudo');
    const total = stops.length;
    const entregues = stops.filter(s => s.status === 'entregue').length;
    const pendentes = stops.filter(s => s.status === 'pendente').length;
    const problemas = stops.filter(s => ['nao_encontrado','pessoa_nao_localizada','endereco_errado'].includes(s.status)).length;
    
    let html = `
        <div style="margin-bottom:16px;">
            <p><strong>📦 Total de pacotes:</strong> ${total}</p>
            <p><strong>✅ Entregues:</strong> ${entregues}</p>
            <p><strong>⏳ Pendentes:</strong> ${pendentes}</p>
            <p><strong>⚠️ Problemas:</strong> ${problemas}</p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:12px;">
            <thead>
                <tr style="background:#334155;">
                    <th style="padding:6px;">#</th>
                    <th style="padding:6px;">Endereço</th>
                    <th style="padding:6px;">Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    stops.forEach((s, i) => {
        html += `
            <tr style="border-bottom:1px solid #475569;">
                <td style="padding:6px;">${i+1}</td>
                <td style="padding:6px;">${s.address}</td>
                <td style="padding:6px;">${traduzirStatus(s.status)}</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    div.innerHTML = html;
    modal.style.display = 'flex';
}

function exportarCSV() {
    let csv = "Ordem;Endereço;Status\n";
    stops.forEach((s, i) => {
        csv += `${i+1};"${s.address.replace(/"/g, '""')}";${traduzirStatus(s.status)}\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); // BOM para acentos
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', 'relatorio_entregas.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// =====================================================
// FUNÇÕES AUXILIARES (navegação externa, etc.)
// =====================================================
function navegarPara(lat, lon) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
}

// =====================================================
// INICIALIZAÇÃO E SERVICE WORKER (PWA)
// =====================================================
window.onload = () => {
    carregarDados();
    initMapa();
    
    // Fechar modais ao clicar fora
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
            pararCamera();
        }
    };
    
    // Registrar Service Worker (para PWA)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('Service Worker registrado com sucesso:', reg);
        }).catch(err => {
            console.warn('Falha ao registrar Service Worker:', err);
        });
    }
};

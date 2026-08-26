let idiomaAtual = 'pt'; 
let tempoPeOrigem = 0;
let tempoPeDestino = 0;
let distanciaParaUber = 0;
let enderecoFinalUber = "";
let modoLiteAtivo = false;

// DETECÇÃO AUTOMÁTICA DE IDIOMA PELO CELULAR DO USUÁRIO
document.addEventListener("DOMContentLoaded", () => {
    const idiomaNavegador = (navigator.language || navigator.userLanguage).substring(0, 2).toLowerCase();
    const idiomasSuportados = ['pt', 'en', 'es', 'fr', 'it', 'de', 'ja', 'zh'];
    if (idiomasSuportados.includes(idiomaNavegador)) {
        document.getElementById('idioma').value = idiomaNavegador;
    } else {
        document.getElementById('idioma').value = 'pt';
    }
    mudarIdioma();
});

// A URL do seu Cloudflare Worker
const BACKEND_URL = "dry-morning-54de.danilolealwolff.workers.dev"; 
const CONFIG_APP = {
    nomeCidade: "Metrô JP",
    linkPlayStore: "https://play.google.com/store/apps/details?id=dev.pages.jp_trilhos.twa" 
};
const grafo = {};
const estacoesLinhasMap = {};
const todasEstacoes = new Set();

// Variável para segurar os relatos do "Waze"
let relatosRecentesGlobal = []; 
let statusGlobalAPI = { oficial: [], waze: [] };

// Função de Segurança: Cria um "RG" anônimo para o celular (Device Fingerprinting)
function getDeviceFingerprint() {
    let deviceId = localStorage.getItem('metro_device_id');
    if (!deviceId) {
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem('metro_device_id', deviceId);
    }
    return deviceId;
}

// UX: Feedback Visual
function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.innerHTML = sanitizeHTML(msg);
    toast.className = "show";
    
    setTimeout(() => { 
        toast.className = toast.className.replace("show", ""); 
    }, 3500);
}

// UX: Feedback Tátil
function dispararVibracao(ms = 50) {
    if (navigator.vibrate) {
        try { 
            navigator.vibrate(ms); 
        } catch(e) {}
    }
}

// Segurança: XSS Sanitizer
function sanitizeHTML(str) {
    if (!str && str !== 0) {
        return "";
    }
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Inicialização de Dados
linhas.forEach(linha => {
    for (let i = 0; i < linha.estacoes.length; i++) {
        let estacao = linha.estacoes[i];
        todasEstacoes.add(estacao);
        
        if (!estacoesLinhasMap[estacao]) {
            estacoesLinhasMap[estacao] = [];
        }
        
        if(!estacoesLinhasMap[estacao].includes(linha.nome)) {
            estacoesLinhasMap[estacao].push(linha.nome);
        }

        if (!grafo[estacao]) {
            grafo[estacao] = {};
        }
        
        if (i > 0) {
            let anterior = linha.estacoes[i - 1];
            grafo[estacao][anterior] = linha;
            grafo[anterior][estacao] = linha;
        }
    }
});

const selectOrigem = document.getElementById('input_origem');
const selectDestino = document.getElementById('input_destino');

function preencherSelects() {
    const dlOrigem = document.getElementById('estacoes_origem');
    const dlDestino = document.getElementById('estacoes_destino');
    
    if (dlOrigem) dlOrigem.innerHTML = "";
    if (dlDestino) dlDestino.innerHTML = "";
    
    Array.from(todasEstacoes).sort().forEach(est => {
        let tagZona = "";
        let zonaCode = (typeof zonasMap !== 'undefined') ? zonasMap[est] : null;
        
        if(zonaCode && dicionario[idiomaAtual].zonas && dicionario[idiomaAtual].zonas[zonaCode]) {
            tagZona = ` - ${dicionario[idiomaAtual].zonas[zonaCode]}`;
        }
        
        let nomeVisual = `${est}${tagZona} (${estacoesLinhasMap[est].join(", ")})`;
        
        let optOrigem = document.createElement('option');
        optOrigem.value = est;
        optOrigem.textContent = nomeVisual;
        if (dlOrigem) dlOrigem.appendChild(optOrigem);

        let optDestino = document.createElement('option');
        optDestino.value = est;
        optDestino.textContent = nomeVisual;
        if (dlDestino) dlDestino.appendChild(optDestino);
    });
}

preencherSelects();
if (selectOrigem) selectOrigem.value = "Luz"; 
if (selectDestino) selectDestino.value = "Aeroporto-Guarulhos";

if (document.getElementById('input_origem')) {
    document.getElementById('input_origem').addEventListener('change', () => { 
        tempoPeOrigem = 0; 
    });
}

if (document.getElementById('input_destino')) {
    document.getElementById('input_destino').addEventListener('change', () => { 
        distanciaParaUber = 0; 
        enderecoFinalUber = ""; 
        tempoPeDestino = 0; 
    });
}

async function definirHorario() {
    const dataSP = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const diaSemana = dataSP.getDay(); 
    const hora = dataSP.getHours();
    const diaMes = dataSP.getDate();
    const mes = dataSP.getMonth() + 1; 
    const lang = dicionario[idiomaAtual];

    const dataAtualStr = `${diaMes.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}`;
    const feriadosSP = ["25/01", "09/07"]; 
    let listaFeriados = [
        "01/01", "21/04", "01/05", "07/09", "12/10", "02/11", "15/11", "20/11", "25/12", ...feriadosSP
    ]; 

    let ehFeriado = listaFeriados.includes(dataAtualStr);
    let horario = `04h40 - 00h00 ${lang.dias_uteis}`;

    if (diaSemana === 6 || (diaSemana === 0 && hora < 1 && !ehFeriado)) {
        horario = `04h40 - 01h00 ${lang.sabado}`;
    } else if (diaSemana === 0 || ehFeriado) {
        horario = `04h40 - 00h00 ${lang.domingo}`;
    }

    document.getElementById('lbl_horario').innerHTML = `${lang.operacao_hoje} <b>${horario}</b>`;
}

definirHorario();

const TARIFA_FALLBACK = 5.40; 
const DOLAR_FALLBACK = 5.50;

function atualizarTarifaHibrida() {
    let tarifaAtual = parseFloat(localStorage.getItem('metro_sp_tarifa')) || TARIFA_FALLBACK;
    let cotacaoDolar = parseFloat(localStorage.getItem('metro_sp_dolar')) || DOLAR_FALLBACK;
    
    const lblTarifa = document.getElementById('lbl_tarifa');
    const tarifaUSD = (tarifaAtual / cotacaoDolar).toFixed(2);
    const tarifaFormatada = tarifaAtual.toFixed(2).replace('.', ',');

    if (idiomaAtual !== 'pt') {
        lblTarifa.innerHTML = `&#127903; Fare Metro: <b>R$ ${tarifaFormatada}</b> (~$${tarifaUSD})`;
    } else {
        lblTarifa.innerHTML = `&#127903; Tarifa Metrô/CPTM: <b>R$ ${tarifaFormatada}</b>`;
    }
}

atualizarTarifaHibrida();

function mudarIdioma() {
    idiomaAtual = document.getElementById('idioma').value;
    const lang = dicionario[idiomaAtual];
    
    // Antigos
    document.getElementById('lbl_origem').innerHTML = lang.origem;
    document.getElementById('lbl_destino').innerHTML = lang.destino;
    document.getElementById('btn_tracar').innerHTML = lang.tracar;
    document.getElementById('lbl_roteiro').innerHTML = lang.roteiro;
    document.getElementById('lbl_btn_mapa').innerHTML = lang.btn_mapa;
    document.getElementById('btn_share').innerHTML = lang.btn_share;
    document.getElementById('btn_salvar_mapa').innerHTML = lang.salvar_mapa;
    document.getElementById('lbl_busca_titulo').innerHTML = lang.busca_titulo;
    document.getElementById('input_endereco').placeholder = lang.busca_placeholder;
    document.getElementById('btn_buscar_end').innerHTML = lang.btn_buscar;
    document.getElementById('btn_arredores').innerHTML = `${lang.arredores} <span>&#9660;</span>`;
    
    // Os novos
    document.getElementById('lbl_subtitle').innerHTML = lang.subtitulo;
    document.getElementById('badge_offline').innerHTML = lang.badge_offline;
    document.getElementById('lbl_pwa_text').innerHTML = lang.pwa_texto;
    document.getElementById('btn-install-pwa').innerHTML = lang.pwa_btn;
    document.getElementById('lbl_btn_samu').innerText = lang.btn_samu;
    document.getElementById('lbl_samu_sub').innerHTML = lang.btn_samu_sub;
    document.getElementById('lbl_btn_denuncia_metro').innerText = lang.btn_sms;
    document.getElementById('lbl_denuncia_sub').innerHTML = lang.btn_sms_sub;
    document.getElementById('lbl_btn_denuncia_cptm').innerText = lang.btn_wpp;
    document.getElementById('lbl_wpp_sub').innerHTML = lang.btn_wpp_sub;
    document.getElementById('aviso_legal_box').innerHTML = lang.aviso_legal;
    document.getElementById('lbl_titulo_mapa').innerHTML = lang.mapa_titulo;
    document.getElementById('btn_voltar_mapa').innerHTML = `&#11013; ${lang.voltar}`;
    document.getElementById('lbl_btn_status').innerText = lang.btn_status;
    document.getElementById('lbl_titulo_status').innerHTML = lang.status_titulo;
    document.getElementById('btn_voltar_status').innerHTML = `&#11013; ${lang.voltar}`;
    
    // Atualiza o tema do botão Escuro/Claro
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('btn_tema').innerHTML = isDark ? lang.badge_tema_claro : lang.badge_tema_escuro;

    // Atualiza os placeholders dos inputs de busca
    if (document.getElementById('input_origem')) {
        document.getElementById('input_origem').placeholder = lang.origem === '📍 Origem:' ? 'De onde você vai sair?' : 'Search station...';
    }
    if (document.getElementById('input_destino')) {
        document.getElementById('input_destino').placeholder = lang.destino === '🏁 Destino:' ? 'Para onde você vai?' : 'Search station...';
    }

    atualizarTarifaHibrida();
    definirHorario();
    
    if (document.getElementById('lbl_last_update')) document.getElementById('lbl_last_update').innerText = lang.ultima_atualizacao || "Última atualização:";
    if (document.getElementById('seo_titulo')) document.getElementById('seo_titulo').innerHTML = lang.seo_titulo || "Informações Técnicas do Sistema";
    if (document.getElementById('seo_texto')) document.getElementById('seo_texto').innerHTML = lang.seo_texto || document.getElementById('seo_texto').innerHTML;

    if (document.getElementById('modalStatus').style.display === 'flex') {
        renderizarListaDeLinhas(); 
    }
    
    let valO = selectOrigem ? selectOrigem.value : ""; 
    let valD = selectDestino ? selectDestino.value : "";
    preencherSelects();
    if (selectOrigem) selectOrigem.value = valO; 
    if (selectDestino) selectDestino.value = valD;
    
    if(document.getElementById('resultado').style.display === 'block') {
        calcularRota();
    }
    if(document.getElementById('resultado_endereco').style.display === 'block') {
        document.getElementById('resultado_endereco').style.display = 'none'; 
    }
    
     const privacyLinks = document.querySelectorAll("a[href*='privacidade.html'], a[href*='privacy_en.html']");
    privacyLinks.forEach(link => {
        if (idiomaAtual === 'en') {
            link.href = 'privacy_en.html';
        } else {
            link.href = 'privacidade.html';
        }
    });
}

// GPS REAL INTEGRADO
function usarGPS() {
    const btn = document.getElementById('btn_gps');
    const lang = dicionario[idiomaAtual];

    if (!navigator.geolocation) {
        showToast(idiomaAtual === 'pt' ? "Geolocalização não suportada." : "Geolocation not supported.");
        return;
    }

    btn.innerHTML = "⏳"; 
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latUser = position.coords.latitude; 
            const lonUser = position.coords.longitude;
            let estacaoMaisProxima = ""; 
            let menorDistancia = Infinity;
            
            for(let est in coordsEstacoes) {
                let dist = calcularDistancia(latUser, lonUser, coordsEstacoes[est].lat, coordsEstacoes[est].lon);
                if(dist < menorDistancia) { 
                    menorDistancia = dist; 
                    estacaoMaisProxima = est; 
                }
            }
            
            if(estacaoMaisProxima) { 
                preencherEstacao('origem', estacaoMaisProxima, 0); 
                showToast(lang.alerta_gps); 
            }
            
            btn.innerHTML = "&#128205;"; 
            btn.disabled = false;
        },
        (error) => {
            showToast(idiomaAtual === 'pt' ? "Erro GPS. Verifique permissões." : "GPS Error.");
            btn.innerHTML = "&#128205;"; 
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function compartilharRota() {
    const roteiroHtml = document.getElementById('rota-passos');
    if (!roteiroHtml || roteiroHtml.children.length === 0) {
        if(typeof showToast === "function") showToast("Calcule uma rota primeiro!");
        return;
    }

    let textoRota = `📍 Minha Rota - ${CONFIG_APP.nomeCidade}:\n\n`;
    Array.from(roteiroHtml.children).forEach(passo => { 
        let textoPasso = passo.innerText.trim().replace(/\n+/g, ' - ');
        if (textoPasso) {
            textoRota += `🔹 ${textoPasso}\n`; 
        }
    });
    
    textoRota += `\n🚇 Nunca mais se perca no metrô! Ache a rota mais rápida no app gratuito:\n👉 ${CONFIG_APP.linkPlayStore}`;
    
    if (navigator.share) {
        navigator.share({ 
            title: `Rota ${CONFIG_APP.nomeCidade}`, 
            text: textoRota 
        }).catch(err => {
            fallbackCopiarTexto(textoRota);
        });
    } else { 
        fallbackCopiarTexto(textoRota);
    }
}

function fallbackCopiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(() => {
            if(typeof showToast === "function") showToast("Rota copiada para a área de transferência!");
        }).catch(console.error);
    }
}

// 🚗 LÓGICA DA UBER - SÃO PAULO
function chamarUber() {
    const CLIENT_ID = "pa7Ffnl5ZXD-zV5dShZ95JYddeSA05Kl";
    const AFFILIATE_ID = ""; // Coloque seu ID da Impact aqui no futuro
    
    const destinoEnd = selectDestino.value;
    let urlUber = "";
    
    if (coordsEstacoes[destinoEnd]) {
        const lat = coordsEstacoes[destinoEnd].lat; 
        const lon = coordsEstacoes[destinoEnd].lon;
        const nickname = encodeURIComponent(`Estação ${destinoEnd}`);
        
        urlUber = `https://m.uber.com/ul/?client_id=${CLIENT_ID}&action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lon}&dropoff[nickname]=${nickname}&affiliate_id=${AFFILIATE_ID}`;
    } else {
        const endUber = encodeURIComponent(`${enderecoFinalUber ? enderecoFinalUber : destinoEnd}, São Paulo`);
        urlUber = `https://m.uber.com/ul/?client_id=${CLIENT_ID}&action=setPickup&pickup=my_location&dropoff[query]=${endUber}&affiliate_id=${AFFILIATE_ID}`;
    }
    
    window.open(urlUber, '_blank');
}

function inverterEstacoes() {
    dispararVibracao(50);
    
    let temp = selectOrigem.value; 
    selectOrigem.value = selectDestino.value; 
    selectDestino.value = temp;
    
    let tempPe = tempoPeOrigem; 
    tempoPeOrigem = tempoPeDestino; 
    tempoPeDestino = tempPe;
    
    if(document.getElementById('resultado').style.display === 'block') {
        calcularRota();
    }
}

let ultimoElementoFocado = null;

function abrirModal(id) { 
    ultimoElementoFocado = document.activeElement; 
    const modal = document.getElementById(id);
    
    modal.style.display = 'flex'; 
    document.body.style.overflow = 'hidden'; 
    modal.setAttribute('aria-modal', 'true'); 
    modal.setAttribute('role', 'dialog');
    
    history.pushState({ modal: id }, "", "#" + id);
    
    if (id === 'modalMapa') {
        document.getElementById('imgMapa').style.width = '100%';
    }
}

function fecharModal() { 
    history.back(); 
}

function esconderModais() {
    document.getElementById('modalMapa').style.display = 'none'; 
    document.getElementById('modalStatus').style.display = 'none'; 
    document.body.style.overflow = 'auto';
    
    if (ultimoElementoFocado) { 
        ultimoElementoFocado.focus(); 
        ultimoElementoFocado = null; 
    }
}

window.addEventListener('popstate', function(event) { 
    esconderModais(); 
});

function toggleArredores() {
    const conteudo = document.getElementById('poi-detalhes');
    if (conteudo.style.display === 'none' || conteudo.style.display === '') {
        conteudo.style.display = 'flex';
    } else {
        conteudo.style.display = 'none';
    }
}

function encontrarCaminho(inicio, fim) {
    if (inicio === fim) return [inicio];
    
    let distancias = {}; 
    let anterior = {}; 
    let naoVisitados = new Set(todasEstacoes);
    
    todasEstacoes.forEach(est => {
        distancias[est] = Infinity;
    });
    
    distancias[inicio] = 0;

    while(naoVisitados.size > 0) {
        let atual = null; 
        let menorDist = Infinity;
        
        naoVisitados.forEach(est => { 
            if(distancias[est] < menorDist) { 
                menorDist = distancias[est]; 
                atual = est; 
            } 
        });
        
        if(atual === null || atual === fim) break;
        
        naoVisitados.delete(atual);

        for(let vizinho in grafo[atual]) {
            if(!naoVisitados.has(vizinho)) continue;
            
            let linhaDesteCaminho = grafo[atual][vizinho].nome;
            let linhaAnterior = anterior[atual] ? grafo[anterior[atual]][atual].nome : linhaDesteCaminho;
            
            let peso = (linhaDesteCaminho === linhaAnterior) ? 1 : 10; 
            let novaDist = distancias[atual] + peso;
            
            if(novaDist < distancias[vizinho]) { 
                distancias[vizinho] = novaDist; 
                anterior[vizinho] = atual; 
            }
        }
    }
    
    let caminho = []; 
    let passo = fim;
    
    while(passo) { 
        caminho.unshift(passo); 
        passo = anterior[passo]; 
    }
    
    return caminho.length > 1 ? caminho : null;
}

function gerarDadosDaRota(origem, destino) {
    if (origem === destino) return { erro: 'mesma_estacao' };
    
    const rota = encontrarCaminho(origem, destino);
    if (!rota) return { erro: 'rota_nao_encontrada' };

    let linhaAtual = null; 
    let qtdBaldeacoes = 0; 
    let passouTatuapeItaquera = false; 
    let passos = [];

    for (let i = 0; i < rota.length - 1; i++) {
        let de = rota[i]; 
        let para = rota[i+1]; 
        let infoLinha = grafo[de][para];
        
        if (de === "Tatuapé" || de === "Corinthians-Itaquera") {
            passouTatuapeItaquera = true;
        }

        if (linhaAtual !== infoLinha.nome) {
            if (linhaAtual !== null) qtdBaldeacoes++;
            
            linhaAtual = infoLinha.nome;
            let estacaoDestinoSentido = "Destino";
            
            if(infoLinha.estacoes.length > 2) {
                let indexA = infoLinha.estacoes.indexOf(de); 
                let indexB = infoLinha.estacoes.indexOf(para);
                if (indexB > indexA) {
                    estacaoDestinoSentido = infoLinha.estacoes[infoLinha.estacoes.length - 1];
                } else {
                    estacaoDestinoSentido = infoLinha.estacoes[0];
                }
            }
            
            passos.push({ 
                tipo: i === 0 ? 'embarque' : 'baldeacao', 
                estacao: de, 
                linha: infoLinha, 
                sentido: estacaoDestinoSentido 
            });
        }
    }
    
    passos.push({ tipo: 'desembarque', estacao: destino });
    let tempoMetro = Math.ceil(((rota.length - 1) * 3) + (qtdBaldeacoes * 5));

    return { 
        erro: null, rota: rota, passos: passos, tempoMetro: tempoMetro, 
        qtdBaldeacoes: qtdBaldeacoes, passouTatuapeItaquera: passouTatuapeItaquera 
    };
}

function calcularLogicaRota(origem, destino) {
    const dados = gerarDadosDaRota(origem, destino);
    if (dados.erro) return dados;
    let tempoGeral = dados.tempoMetro + tempoPeOrigem + tempoPeDestino;
    return { ...dados, origem, destino, tempoTotalGeral: tempoGeral, totalApe: (tempoPeOrigem + tempoPeDestino) };
}

function calcularRota() {
    dispararVibracao(50);
    const lang = dicionario[idiomaAtual];
    
    const resultadoDiv = document.getElementById('resultado'); 
    const rotaPassosDiv = document.getElementById('rota-passos');
    const boxTempo = document.getElementById('tempo-estimado'); 
    const avisoIntegracao = document.getElementById('aviso-integracao');
    
    resultadoDiv.style.display = 'block'; 
    rotaPassosDiv.innerHTML = ''; 
    avisoIntegracao.style.display = 'none';
    
    const rotaCalculada = calcularLogicaRota(selectOrigem.value, selectDestino.value);

    if (rotaCalculada.erro === 'mesma_estacao') {
        rotaPassosDiv.innerHTML = `<p>${lang.mesma_estacao}</p>`; 
        boxTempo.style.display = 'none'; 
        document.getElementById('arredores-container').style.display = 'none'; 
        return;
    }

    document.getElementById('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    boxTempo.style.display = 'block';

    rotaCalculada.passos.forEach(passo => {
        let elemento = document.createElement('div'); 
        elemento.className = 'route-step';
        
        if (passo.tipo === 'desembarque') {
            elemento.innerHTML = `&#127937; <span>${lang.desembarque} <b>${sanitizeHTML(passo.estacao)}</b></span>`;
        } else {
            let acao = passo.tipo === 'embarque' ? lang.embarque : lang.baldeacao;
            elemento.innerHTML = `
                <span class="line-badge" style="background-color: ${sanitizeHTML(passo.linha.cor)};">
                    ${sanitizeHTML(passo.linha.nome)}
                </span>
                <div>
                    ${acao} <b>${sanitizeHTML(passo.estacao)}</b>
                    <span class="sentido-text">${lang.sentido} <b>${sanitizeHTML(passo.sentido)}</b></span>
                </div>`;
        }
        rotaPassosDiv.appendChild(elemento);
    });
    
    if (rotaCalculada.passouTatuapeItaquera && rotaCalculada.qtdBaldeacoes > 0) { 
        avisoIntegracao.innerHTML = lang.aviso_tatuape; 
        avisoIntegracao.style.display = 'block'; 
    }
    
    if (tempoPeOrigem > 0 || tempoPeDestino > 0) {
        let strBaseTotal = lang.tempo_total.replace("~", "~" + rotaCalculada.tempoTotalGeral);
        let strDetalhe = lang.detalhe_tempo.replace("{metro}", rotaCalculada.tempoMetro).replace("{pe}", rotaCalculada.totalApe);
        boxTempo.innerHTML = `${strBaseTotal} <br><span style='font-size:12px; font-weight:normal;'>${strDetalhe}</span>`;
    } else { 
        boxTempo.innerHTML = `${lang.tempo}${rotaCalculada.tempoMetro} ${lang.min}`; 
    }

    const btnUber = document.getElementById('btn_uber');
    if (distanciaParaUber > 1000) {
        btnUber.style.display = 'flex'; 
        btnUber.innerHTML = lang.uber_dist.replace('{dist}', formatarDistancia(distanciaParaUber, idiomaAtual));
    } else { 
        btnUber.style.display = 'none'; 
    }
    
    renderizarArredores(rotaCalculada.destino, lang);
}

function renderizarArredores(destino, lang) {
    const arredoresContainer = document.getElementById('arredores-container');
    const poiDetalhes = document.getElementById('poi-detalhes');
    
    if (typeof pontosTuristicos !== 'undefined' && pontosTuristicos[destino]) {
        arredoresContainer.style.display = 'block'; 
        poiDetalhes.style.display = 'none'; 
        
        const traducoesCat = { 
            pt: { cultura: "🎭 Cultura", parques: "🌳 Parques", compras: "🛍️ Compras", gastronomia: "🍔 Gastronomia", servicos: "🏢 Serviços", lazer: "🎉 Lazer" } 
        };
        const langCat = traducoesCat[idiomaAtual] || traducoesCat['pt'];
        
        let htmlArredores = "";
        
        for (let categoria in pontosTuristicos[destino]) {
            let nomeCategoria = langCat[categoria] || categoria;
            let listaHTML = pontosTuristicos[destino][categoria].map(t => `<li>${sanitizeHTML(t)}</li>`).join('');
            
            htmlArredores += `
                <div class="poi-category">
                    <h4>${sanitizeHTML(nomeCategoria)}</h4>
                    <ul>${listaHTML}</ul>
                </div>`;
        }
        
        poiDetalhes.innerHTML = htmlArredores;
    } else { 
        arredoresContainer.style.display = 'none'; 
    }
}

function formatarDistancia(metros, idioma) {
    let metrico = metros >= 1000 ? (metros / 1000).toFixed(1) + " km" : metros + " m";
    if (idioma === 'en') {
        let imperial = metros >= 160.9 ? (metros / 1609.34).toFixed(1) + " mi" : Math.round(metros * 3.28084) + " ft";
        return metrico + " (" + imperial + ")";
    }
    return metrico;
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180; 
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); 
}

// MICROFONE ROBUSTO
function iniciarBuscaPorVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btnVoz = document.getElementById('btn_voz'); 
    const inputEnd = document.getElementById('input_endereco');
    
    if (!SpeechRecognition) { 
        showToast("Busca por voz não suportada. Use o teclado."); 
        return; 
    }

    const recognition = new SpeechRecognition();
    recognition.lang = idiomaAtual === 'pt' ? 'pt-BR' : (idiomaAtual === 'en' ? 'en-US' : 'es-ES');
    
    recognition.onstart = function() { 
        btnVoz.innerHTML = "🔴"; 
        btnVoz.style.animation = "pulse 1s infinite"; 
        inputEnd.placeholder = "Ouvindo..."; 
    };
    
    recognition.onresult = function(e) { 
        inputEnd.value = e.results[0][0].transcript; 
        buscarEndereco(); 
    };
    
    recognition.onerror = function(e) { 
        inputEnd.placeholder = "Ex: Rua Paes Leme, 215"; 
        btnVoz.innerHTML = "🎤"; 
        btnVoz.style.animation = "none"; 
    };
    
    recognition.onend = function() { 
        btnVoz.innerHTML = "🎤"; 
        btnVoz.style.animation = "none"; 
    };
    
    recognition.start();
}

// CACHE E PROXY DE BUSCA
const cacheEnderecos = new Map();
let apiBloqueada = false;

async function buscarEndereco() {
    const rua = document.getElementById('input_endereco').value;
    const resultBox = document.getElementById('resultado_endereco');
    const btn = document.getElementById('btn_buscar_end');
    const lang = dicionario[idiomaAtual]; 

    if (!navigator.onLine) { 
        showToast(idiomaAtual === 'pt' ? "Offline. Requer internet." : "Offline."); 
        return; 
    }
    
    if(!rua) { 
        showToast(lang.alerta_rua); 
        return; 
    }

    const buscaLimpa = rua.toLowerCase().trim();
    
    if ((buscaLimpa.startsWith("rua") || buscaLimpa.startsWith("av ")) && !/\d/.test(buscaLimpa) && idiomaAtual === 'pt') {
        showToast(lang.alerta_numero); 
        return;
    }
    
    if(cacheEnderecos.has(buscaLimpa)) { 
        renderizarResultadoEndereco(cacheEnderecos.get(buscaLimpa), lang, resultBox); 
        return; 
    }
    
    if(apiBloqueada) { 
        showToast("Aguarde um momento..."); 
        return; 
    }
    
    btn.innerHTML = "⏳"; 
    btn.disabled = true; 
    resultBox.style.display = 'none';
    apiBloqueada = true; 
    
    setTimeout(() => { apiBloqueada = false; }, 2000); 
    
    try {
        const urlSegura = `${BACKEND_URL}/api/geocode?q=${encodeURIComponent(rua + ", São Paulo, SP")}`;
        const res = await fetch(urlSegura);
        const data = await res.json();
        
        if(!data || data.length === 0 || data.error) { 
            showToast(lang.alerta_nao_achou); 
            btn.innerHTML = lang.btn_buscar; 
            btn.disabled = false; 
            return; 
        }
        
        const latUser = parseFloat(data[0].lat); 
        const lonUser = parseFloat(data[0].lon);
        let estacaoMaisProxima = ""; 
        let menorDistancia = Infinity;
        
        for(let est of todasEstacoes) {
            if (!coordsEstacoes[est]) continue;
            let dist = calcularDistancia(latUser, lonUser, coordsEstacoes[est].lat, coordsEstacoes[est].lon);
            if(dist < menorDistancia) { 
                menorDistancia = dist; 
                estacaoMaisProxima = est; 
            }
        }
        
        const dadosDoResultado = { 
            estacaoMaisProxima: estacaoMaisProxima, 
            distMetros: Math.round(menorDistancia * 1000), 
            enderecoOriginal: rua 
        };
        
        cacheEnderecos.set(buscaLimpa, dadosDoResultado); 
        renderizarResultadoEndereco(dadosDoResultado, lang, resultBox);
        
    } catch(e) { 
        showToast(lang.alerta_erro_net); 
    }
    
    btn.innerHTML = lang.btn_buscar; 
    btn.disabled = false; 
}

function renderizarResultadoEndereco(dados, lang, resultBox) {
    const tempoPe = Math.ceil((dados.distMetros / 1000) / 4.5 * 60); 
    const tempoCarro = Math.ceil((dados.distMetros / 1000) / 20 * 60); 
    
    distanciaParaUber = dados.distMetros; 
    enderecoFinalUber = dados.enderecoOriginal;
    let recomendacao = dados.distMetros <= 1500 ? lang.recomenda_pe : lang.recomenda_carro;
    
    resultBox.innerHTML = `
        ${lang.estacao_proxima.replace('{estacao}', sanitizeHTML(dados.estacaoMaisProxima))}<br><br>
        ${lang.distancia_texto.replace('{dist}', formatarDistancia(dados.distMetros, idiomaAtual))}<br>
        ${lang.tempo_texto.replace('{pe}', tempoPe).replace('{carro}', tempoCarro)}<br><br>
        💡 ${recomendacao}
        <div class="address-actions">
            <button class="btn-set-station" onclick="preencherEstacao('origem', '${sanitizeHTML(dados.estacaoMaisProxima)}', ${tempoPe})">${lang.btn_sair}</button>
            <button class="btn-set-station" onclick="preencherEstacao('destino', '${sanitizeHTML(dados.estacaoMaisProxima)}', ${tempoPe})">${lang.btn_ir}</button>
        </div>`;
        
    resultBox.style.display = 'block';
}

function preencherEstacao(tipo, nomeEstacao, tempoDeCaminhadaMins = 0) {
    const inputId = (tipo === 'origem') ? 'input_origem' : 'input_destino';
    const input = document.getElementById(inputId);
    if (input) {
        input.value = nomeEstacao;
    }
    
    if (tipo === 'origem') {
        tempoPeOrigem = tempoDeCaminhadaMins;
    }
    if (tipo === 'destino') {
        tempoPeDestino = tempoDeCaminhadaMins;
    }
    
    document.getElementById('btn_tracar').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

if(document.getElementById('input_endereco')) {
    document.getElementById('input_endereco').addEventListener('keypress', function(e) { 
        if (e.key === 'Enter') { 
            buscarEndereco(); 
            this.blur(); 
        } 
    });
}

function alterarZoom(valor) {
    let nivelZoomMap = parseInt(document.getElementById('imgMapa').style.width || '100');
    nivelZoomMap = Math.max(100, Math.min(500, nivelZoomMap + valor));
    document.getElementById('imgMapa').style.width = nivelZoomMap + '%';
}

// TEMA DINÂMICO
const btnTema = document.getElementById('btn_tema');

function aplicarTema(escuro) {
    const metaTheme = document.getElementById('meta-theme-color');
    const lang = dicionario[idiomaAtual];
    
    if (escuro) { 
        document.body.classList.add('dark-mode'); 
        if(btnTema) btnTema.innerHTML = lang.badge_tema_claro; 
        if(metaTheme) metaTheme.setAttribute('content', '#1c1c1e'); 
    } else { 
        document.body.classList.remove('dark-mode'); 
        if(btnTema) btnTema.innerHTML = lang.badge_tema_escuro; 
        if(metaTheme) metaTheme.setAttribute('content', '#00539B'); 
    }
}

function toggleTema() {
    const isDark = document.body.classList.contains('dark-mode');
    aplicarTema(!isDark); 
    localStorage.setItem('tema_escolhido', !isDark ? 'dark' : 'light');
}

function toggleLiteMode() {
    modoLiteAtivo = !modoLiteAtivo;
    const btnLite = document.getElementById('btn_lite');
    
    if(modoLiteAtivo) {
        btnLite.style.background = 'var(--metro-blue)'; 
        btnLite.style.color = 'white';
        btnLite.innerText = '⚡ Lite ON';
        showToast(idiomaAtual === 'en' ? 'Lite Mode ON: Data saver.' : 'Modo Lite ativado: Economia de dados.');
    } else {
        btnLite.style.background = 'transparent';
        btnLite.style.color = 'var(--secundary)';
        btnLite.innerText = '⚡ Lite';
        showToast(idiomaAtual === 'en' ? 'Lite Mode OFF.' : 'Modo Lite desativado.');
    }
}

const temaSalvo = localStorage.getItem('tema_escolhido');
if (temaSalvo === 'dark') {
    aplicarTema(true); 
} else if (temaSalvo === 'light') {
    aplicarTema(false); 
} else {
    aplicarTema(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

// PINCH-TO-ZOOM
const containerMapa = document.getElementById('containerMapa');
const imgMapa = document.getElementById('imgMapa');

let distInicialPinça = null; 
let larguraInicialImg = null;

if(containerMapa) {
    containerMapa.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) { 
            distInicialPinça = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            larguraInicialImg = parseInt(imgMapa.style.width || '100');
        }
    });

    containerMapa.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && distInicialPinça) {
            e.preventDefault(); 
            let distanciaAtual = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            let novaLargura = larguraInicialImg * (distanciaAtual / distInicialPinça);
            imgMapa.style.width = Math.max(100, Math.min(500, novaLargura)) + '%';
        }
    });

    containerMapa.addEventListener('touchend', (e) => { 
        if (e.touches.length < 2) distInicialPinça = null; 
    });
}

// PWA INSTALL
let promptInstalacao;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); 
    promptInstalacao = e;
    const banner = document.getElementById('pwa-install-banner');
    if(banner) banner.style.display = 'flex'; 
});

const btnInstallPwa = document.getElementById('btn-install-pwa');
if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
        if (promptInstalacao) {
            promptInstalacao.prompt(); 
            const { outcome } = await promptInstalacao.userChoice;
            if (outcome === 'accepted') document.getElementById('pwa-install-banner').style.display = 'none';
            promptInstalacao = null;
        }
    });
}

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); }); 
}

// STATUS HÍBRIDO
function abrirModalStatus() {
    abrirModal('modalStatus');
    carregarStatusLinhas(); 
}

function getOperadora(nomeLinha) {
    const nome = nomeLinha.toLowerCase();
    if (nome.includes('1-') || nome.includes('2-') || nome.includes('3-') || nome.includes('15-')) return "Metrô";
    if (nome.includes('4-')) return "ViaQuatro";
    if (nome.includes('5-') || nome.includes('8-') || nome.includes('9-')) return "ViaMobilidade";
    return "CPTM"; 
}

async function carregarStatusLinhas() {
    const painel = document.getElementById('lista-status');
    const lang = dicionario[idiomaAtual];
    
    const horaAtualizacao = document.getElementById('hora_atualizacao_status');
    if (horaAtualizacao) {
        horaAtualizacao.innerText = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    
    if (!navigator.onLine) {
        painel.innerHTML = `<div style="text-align:center; padding:20px; color:#c62828; font-weight:bold;">Offline. Conecte-se para ver.</div>`;
        renderizarListaDeLinhas(); return;
    }

    painel.innerHTML = `<div style="text-align: center; padding: 20px; color:var(--text-color);">⏳ Sincronizando com a rede...</div>`;

    try {
        const res = await fetch(`${BACKEND_URL}/api/status?nocache=${new Date().getTime()}`);
        if (!res.ok) throw new Error("Erro de servidor");
        statusGlobalAPI = await res.json();
    } catch (e) {
        statusGlobalAPI = { oficial: [], waze: [] }; 
    }
    
    renderizarListaDeLinhas();
}

function verificarOperacaoSP() {
    const dataSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hora = dataSP.getHours();
    const min = dataSP.getMinutes();
    const diaSemana = dataSP.getDay(); 

    const tempoAtual = (hora * 60) + min;
    const horarioAbertura = (4 * 60) + 40; 

    if (diaSemana === 0) { 
        const fechamentoSabado = 1 * 60; 
        if (tempoAtual >= fechamentoSabado && tempoAtual < horarioAbertura) return false;
    } else { 
        if (tempoAtual >= 0 && tempoAtual < horarioAbertura) return false;
    }
    return true; 
}

function renderizarListaDeLinhas() {
    const painel = document.getElementById('lista-status');
    const lang = dicionario[idiomaAtual];
    painel.innerHTML = '';

    let htmlAlertas = '';
    let htmlNormais = '';
    let htmlFechadas = '';
    let temAlerta = false;

    linhas.forEach((linha) => {
        const linhaNomeSeguro = sanitizeHTML(linha.nome);
        const operadora = getOperadora(linha.nome); 
        
        const estaAberta = verificarOperacaoSP();
        if (!estaAberta) {
            htmlFechadas += `
                <div style="background-color: var(--card-bg); border: 1px dashed var(--secundary); color: var(--secundary); padding: 10px; border-radius: 8px; font-weight: bold; font-size: 12px; display: flex; align-items: center; justify-content: center; text-align: center; opacity: 0.6; gap: 8px; margin-bottom: 5px;">
                    <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${linha.cor};"></span>
                    <del>${linhaNomeSeguro || sanitizeHTML(linha.nome)}</del> &nbsp;${lang.fora_operacao || "💤 Operação Encerrada"}
                </div>`;
            return; 
        }

        let comProblema = false;
        let statusOficialTexto = `🟢 ${lang.status_normal}`; 
        let corOficial = "#1e7b1e"; 
        
        if (statusGlobalAPI.oficial && statusGlobalAPI.oficial.length > 0) {
            const dadoOficial = statusGlobalAPI.oficial.find(l => l.nome && (l.nome.toLowerCase().includes(linha.nome.toLowerCase()) || l.id === linha.id));
            if (dadoOficial) {
                const situacao = sanitizeHTML(dadoOficial.situacao);
                if (situacao.toLowerCase() !== "operação normal" && situacao.toLowerCase() !== "normal") { 
                    let situacaoTraduzida = situacao;
                    if (situacao.toLowerCase().includes("paralisada")) situacaoTraduzida = lang.parado || "Paralisada";
                    if (situacao.toLowerCase().includes("reduzida")) situacaoTraduzida = lang.reduzida || "Velocidade Reduzida";
                    if (situacao.toLowerCase().includes("encerrada")) situacaoTraduzida = lang.encerrada || "Operação Encerrada";
                    if (situacao.toLowerCase().includes("parcial")) situacaoTraduzida = lang.parcial || "Operação Parcial";
                    
                    statusOficialTexto = `🔴 ${situacaoTraduzida}`; 
                    corOficial = "#c62828"; 
                    comProblema = true;
                }
            }
        }

        let statusUsuariosTexto = `🟢 ${lang.sem_relatos}`; 
        let corUsuarios = "#1e7b1e"; 
        let detalhesUsuarios = ""; 
        let qtdeRelatos = 0;
        
        if (statusGlobalAPI.waze && statusGlobalAPI.waze.length > 0) {
            const relatosDestaLinha = statusGlobalAPI.waze.filter(r => r.linha === linha.nome);
            qtdeRelatos = relatosDestaLinha.length;
            
            if (qtdeRelatos > 0) {
                const ultimoRelato = relatosDestaLinha[0];
                const tipoSeguro = sanitizeHTML(ultimoRelato.tipo);
                
                if (tipoSeguro === "Trem/Metrô parado") { 
                    statusUsuariosTexto = `🔴 ${lang.parado || "Parado"}`; corUsuarios = "#c62828"; comProblema = true; 
                } 
                else if (tipoSeguro === "Velocidade reduzida") { 
                    statusUsuariosTexto = `🟠 ${lang.reduzida || "Velocidade Reduzida"}`; corUsuarios = "#ff9800"; comProblema = true; 
                }
                
                const minutosAtras = Math.floor((Date.now() - ultimoRelato.timestamp) / 60000);
                const tempoTexto = minutosAtras < 1 ? lang.agora_mesmo : lang.ha_mins.replace('{min}', minutosAtras);
                
                detalhesUsuarios = `
                    <span style="font-size:12px; color:var(--secundary); display:block; margin-top:2px;">
                        ⚠️ ${qtdeRelatos} ${lang.alertas} ${tempoTexto}
                    </span>`;
            }
        }

        if (comProblema) {
            temAlerta = true;
            htmlAlertas += `
                <div class="status-item" style="flex-direction: column; align-items: stretch; padding: 15px; border-bottom: 1px solid var(--secundary); background: #fff5f5; border-left: 4px solid #c62828; margin: 10px 15px; border-radius: 12px;">
                    <div onclick="iniciarReporte('${linhaNomeSeguro}')" style="background-color: ${linha.cor}; color: white; padding: 12px 15px; border-radius: 10px; font-weight: bold; font-size: 15px; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                        <span>${linhaNomeSeguro}</span>
                        <span style="background: rgba(255,255,255,0.25); padding: 5px 10px; border-radius: 20px; font-size: 11px; display: flex; align-items: center; gap: 5px;">
                            📢 Reforçar
                        </span>
                    </div>
                    <div class="status-info" style="margin-top: 12px; text-align: left; background: var(--bg-color); padding: 10px; border-radius: 8px;">
                        <span style="font-size:13px; display:block; color: ${corOficial};">
                            <b>${lang.oficial} (${operadora}):</b> ${statusOficialTexto}
                        </span>
                        <span style="font-size:13px; display:block; color: ${corUsuarios}; margin-top:6px;">
                            <b>${lang.usuarios}:</b> ${statusUsuariosTexto}
                        </span>
                        ${detalhesUsuarios}
                    </div>
                </div>`;
        } else {
            htmlNormais += `
                <button onclick="iniciarReporte('${linhaNomeSeguro}')" style="background-color: ${linha.cor}; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; text-shadow: 0 1px 2px rgba(0,0,0,0.3); box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; text-align: center; transition: transform 0.1s;">
                    ${linhaNomeSeguro}
                </button>`;
        }
    });

    let telaFinal = `
        <div style="margin: 15px; background: linear-gradient(135deg, var(--metro-blue), #003d73); color: white; padding: 15px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,83,155,0.25);">
          <h4 style="margin: 0 0 6px 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">${lang.status_viagem || "📣 Como está a sua viagem?"}</h4>
            <p style="margin: 0; font-size: 13px; line-height: 1.4; opacity: 0.95;">${lang.status_viagem_desc || "Viu algum trem parado ou lentidão? Ajude a comunidade..."}</p>
        </div>
    `;

    if (temAlerta) {
        telaFinal += `
            <div style="padding: 5px 15px;">
                <h3 style="margin: 0; color: #c62828; font-size: 16px; display: flex; align-items: center; gap: 6px;">⚠️ ${lang.alertas_ativos}</h3>
            </div>
            ${htmlAlertas}
        `;
    } else if (htmlNormais !== '') {
        telaFinal += `
            <div style="padding: 12px; text-align: center; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 12px; margin: 15px; color: #2e7d32;">
              <b style="font-size: 14px;">${lang.nenhuma_anomalia || "🎉 Nenhuma anomalia relatada no momento."}</b>
            </div>
        `;
    }

    if (htmlNormais !== '') {
        telaFinal += `
            <div style="padding: 0 15px 15px 15px;">
                <h3 style="margin: 15px 0 10px 0; color: var(--text-color); font-size: 14px; border-bottom: 1px solid #e5e5ea; padding-bottom: 5px;">${lang.operando_agora || "✅ Operando Agora (Toque para reportar)"}</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    ${htmlNormais}
                </div>
            </div>
        `;
    }

    if (htmlFechadas !== '') {
        telaFinal += `
            <div style="padding: 0 15px 25px 15px;">
                <h3 style="margin: 10px 0 10px 0; color: var(--secundary); font-size: 14px; border-bottom: 1px solid #e5e5ea; padding-bottom: 5px;">${lang.operacao_encerrada || "🌙 Operação Encerrada"}</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    ${htmlFechadas}
                </div>
            </div>
        `;
    }

    painel.innerHTML = telaFinal;
}

function iniciarReporte(nomeDaLinha) {
    const lang = dicionario[idiomaAtual];
    if (!navigator.onLine) { showToast(lang.alerta_erro_net); return; }
    
    const botoes = [
        { br: "Trem/Metrô parado", trans: lang.parado || "Trem/Metrô parado" },
        { br: "Velocidade reduzida", trans: lang.reduzida || "Velocidade reduzida" }
    ];
    
    let botoesHTML = botoes.map(btn => 
        `<button onclick="prepararEnvio('${nomeDaLinha}', '${btn.br}')" style="display:block; width:100%; padding:14px; margin-bottom:10px; background:var(--bg-color); color:var(--text-color); border:1px solid var(--secundary); border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer;">
            ${btn.trans}
        </button>`
    ).join('');

    const modalHTML = `
        <div id="modal-report" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; padding: 20px; box-sizing: border-box;">
            <div style="background:var(--card-bg); width:100%; max-width:400px; padding:25px; border-radius:16px; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0; color:var(--text-color); text-align:center; font-size:18px;">${lang.reporte_titulo.replace('{linha}', nomeDaLinha)}</h3>
                <div style="margin-top:20px;">
                    ${botoesHTML}
                </div>
                <button onclick="document.getElementById('modal-report').remove()" style="display:block; width:100%; padding:12px; margin-top:10px; background:transparent; color:#ff3b30; border:none; font-weight:bold; font-size:16px; cursor:pointer;">
                    ${lang.cancelar}
                </button>
            </div>
        </div>`;
        
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function prepararEnvio(linha, tipo) {
    const lang = dicionario[idiomaAtual];
    const msgConfirmacao = lang.confirmar_reporte ? `${lang.confirmar_reporte} ${linha}?` : `Confirmar alerta na ${linha}?`;
    if (!confirm(msgConfirmacao)) return; 
    
    showToast(lang.gps_necessario || "Verificando localização...");
    
    if (!navigator.geolocation) {
        showToast(lang.alerta_erro_net);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latUser = position.coords.latitude; 
            const lonUser = position.coords.longitude;
            let menorDist = Infinity;
            for(let est in coordsEstacoes) {
                let dist = calcularDistancia(latUser, lonUser, coordsEstacoes[est].lat, coordsEstacoes[est].lon);
                if(dist < menorDist) menorDist = dist; 
            }
            if (menorDist > 40) {
                showToast(lang.gps_longe || "Você está muito longe para reportar.");
                setTimeout(() => { 
                    const modal = document.getElementById('modal-report');
                    if (modal) modal.remove(); 
                }, 2000);
                return; 
            }
            enviarReporteParaBackend(linha, tipo, latUser, lonUser);
        },
        (error) => { 
            showToast("⚠️ Ative a localização (GPS) para reportar problemas de forma segura."); 
            const modal = document.getElementById('modal-report');
            if (modal) modal.remove();
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
    );
}

async function enviarReporteParaBackend(linha, tipo, latUser, lonUser) {
    const modal = document.getElementById('modal-report');
    if (modal) modal.remove();
    showToast(`Enviando alerta para ${linha}...`);
    const deviceId = getDeviceFingerprint(); 

    try {
        const response = await fetch(`${BACKEND_URL}/api/status`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linha: linha, tipo: tipo, deviceId: deviceId, lat: latUser, lng: lonUser }) 
        });
        const data = await response.json();
        if (response.ok) { 
            showToast("Alerta enviado! A comunidade agradece."); 
            carregarStatusLinhas(); 
        } else { 
            showToast("Erro: " + (data.error || "Falha ao enviar.")); 
        }
    } catch (error) { showToast("Erro de conexão ao enviar relato."); }
}

document.getElementById('aviso_legal_box').innerHTML = dicionario[idiomaAtual].aviso_legal;

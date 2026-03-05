// ================================
// OPÇÃO A: Conectar no Chrome já aberto
// 1) Abra o Chrome com:
//    chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\\meuPerfilChrome"
// 2) Confirme que existe: http://127.0.0.1:9222/json/version
// 3) Use puppeteer.connect({ browserURL: "http://127.0.0.1:9222" })

// OPÇÃO B: Iniciar Chrome via Puppeteer (perfil opcional)
// Use puppeteer.launch({ headless:false, args:[ '--user-data-dir=...' ] })

const puppeteer = require("puppeteer");

class SefazNfeDownloader {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // --------- Inicialização ---------
  async init({ modo = "connect", browserURL = "http://127.0.0.1:9222", userDataDir = null } = {}) {
    if (modo === "connect") {
      // Conecta em um Chrome já aberto com --remote-debugging-port=9222
      this.browser = await puppeteer.connect({ browserURL });
      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());
    } else {
      // Inicia instância própria
      const args = ["--window-size=1366,768"];
      if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
      this.browser = await puppeteer.launch({ headless: false, defaultViewport: null, args });
      this.page = await this.browser.newPage();
    }

    await this.page.setBypassCSP(true);
    return this;
  }

  // --------- Utilitários ---------
  async goto(url) {
    console.log("Navegando:", url);
    await this.page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  }

  async waitVisible(selector, timeout = 20000) {
    await this.page.waitForSelector(selector, { visible: true, timeout });
  }

  async type(selector, text, { delay = 40 } = {}) {
    await this.waitVisible(selector);
    await this.page.click(selector, { clickCount: 3 });
    await this.page.type(selector, text, { delay });
  }

  async select(selector, value) {
    await this.waitVisible(selector);
    await this.page.select(selector, value);
  }

  async click(selector) {
    await this.waitVisible(selector);
    await this.page.click(selector);
  }

  async waitButtonEnabledById(id, timeout = 20000) {
    await this.page.waitForFunction(
      (btnId) => {
        const btn = document.querySelector(btnId);
        return btn && !btn.disabled;
      },
      { timeout },
      id
    );
  }

  // --------- UI simples para período ---------
  async askPeriodo() {
    // Injeta HTML mínimo e abre um prompt modal (igual finalidade: coletar cnpj/ano/meses)
    await this.page.setContent(`
      <html lang="pt-BR">
      <body style="font-family:Arial;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <button id="start" style="padding:12px 18px;font-size:16px;cursor:pointer">Configurar período</button>
      </body>
      </html>
    `);

    await this.page.click("#start");

    return await this.page.evaluate(() => {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:99999";
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;color:#111;padding:14px;border-radius:8px;width:360px";

        box.innerHTML = `
          <h3 style="margin:0 0 10px">Período (SEFAZ)</h3>
          <label>CNPJ</label><input id="cnpj" style="width:100%;padding:8px;margin:4px 0 10px" value="">
          <label>Ano</label><input id="ano" type="number" style="width:100%;padding:8px;margin:4px 0 10px" value="2024">
          <div style="display:flex;gap:10px">
            <div style="flex:1">
              <label>Mês início</label><input id="mi" type="number" min="1" max="12" style="width:100%;padding:8px;margin:4px 0 10px" value="1">
            </div>
            <div style="flex:1">
              <label>Mês fim</label><input id="mf" type="number" min="1" max="12" style="width:100%;padding:8px;margin:4px 0 10px" value="12">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button id="cancel">Cancelar</button>
            <button id="ok" style="background:#0b5;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer">OK</button>
          </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const close = (val) => {
          document.body.removeChild(overlay);
          resolve(val);
        };

        box.querySelector("#cancel").onclick = () => close({ success: false });

        box.querySelector("#ok").onclick = () => {
          const cnpj = box.querySelector("#cnpj").value.trim();
          const ano = parseInt(box.querySelector("#ano").value, 10);
          const mi = parseInt(box.querySelector("#mi").value, 10);
          const mf = parseInt(box.querySelector("#mf").value, 10);

          const ok =
            cnpj &&
            Number.isInteger(ano) &&
            mi >= 1 && mi <= 12 &&
            mf >= 1 && mf <= 12 &&
            mi <= mf;

          if (!ok) {
            alert("Preencha corretamente: CNPJ obrigatório, meses 1..12 e mês início <= mês fim.");
            return;
          }

          close({ success: true, cnpj, ano, mesInicio: mi, mesFinal: mf });
        };
      });
    });
  }

  // --------- Datas / períodos ---------
  getDiasNoMes(mes, ano) {
    const bissexto = (ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0));
    const dias = { 1:31, 2:(bissexto?29:28), 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 };
    return dias[mes];
  }

  gerarPeriodos(mesInicio, mesFinal, ano) {
    const periodos = [];
    for (let mes = mesInicio; mes <= mesFinal; mes++) {
      const mm = String(mes).padStart(2, "0");
      const dias = this.getDiasNoMes(mes, ano);
      periodos.push({
        descricao: `${mm}/${ano}`,
        dataInicial: `01/${mm}/${ano}`,
        dataFinal: `${dias}/${mm}/${ano}`,
      });
    }
    return periodos;
  }

  // --------- Fluxo principal por período ---------
  async processarPeriodo({ cnpj, periodo }) {
    // Ajuste: seletores podem variar conforme HTML da SEFAZ. Mantidos os seus.
    await this.waitVisible('input[name="cmpDataInicial"]');
    await this.type('input[name="cmpDataInicial"]', periodo.dataInicial);
    await this.type('input[name="cmpDataFinal"]', periodo.dataFinal);

    await this.select('select[name="cmpCnpj"]', cnpj);

    // Situação: 2 (conforme seu script)
    await this.waitVisible('select[name="cmpSituacao"]');
    await this.select('select[name="cmpSituacao"]', "2");

    await this.waitButtonEnabledById("#btnPesquisar");
    await this.click("#btnPesquisar");

    // Aguarda resultados aparecerem (fallback: segue mesmo se timeout)
    try {
      await this.page.waitForSelector("#tabelaResultados, .resultado-grid, table, .table", { timeout: 20000 });
    } catch {
      console.log("ATENÇÃO - Timeout aguardando tabela de resultados; seguindo fluxo.");
    }

    // Aguarda existir botão “Baixar todos os arquivos” habilitado
    await this.page.waitForFunction(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Baixar todos os arquivos") && !b.disabled
      );
      return !!btn;
    }, { timeout: 30000 });

    // Clique no botão que você usa (ajuste se necessário)
    // 1) botão principal
    await this.page.click("button.btn-download-all");

    // 2) confirmação
    await this.page.click("#dnwld-all-btn-ok");

    console.log("OK - Download disparado:", periodo.descricao);
  }

  async run() {
    const user = await this.askPeriodo();
    if (!user.success) {
      console.log("Operação cancelada.");
      return;
    }

    const { cnpj, ano, mesInicio, mesFinal } = user;
    const periodos = this.gerarPeriodos(mesInicio, mesFinal, ano);

    console.log("CNPJ:", cnpj);
    console.log("Períodos:", periodos.map(p => p.descricao).join(", "));

    // Navega para o site real e executa loop
    await this.goto("https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-publica");

    for (const periodo of periodos) {
      console.log("\nProcessando:", periodo.descricao);

      await this.processarPeriodo({ cnpj, periodo });

      // Volta para nova consulta (mais estável do que tentar limpar campos)
      await this.page.waitForTimeout(3000);
      await this.goto("https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-publica");
    }

    console.log("\nOK - Finalizado.");
  }

  async close() {
    try {
      if (this.browser) await this.browser.close();
    } catch {}
  }
}

// ================================
// EXECUÇÃO
(async () => {
  const bot = new SefazNfeDownloader();

  try {
    // Ajuste aqui:
    // modo: "connect" ou "launch"
    // browserURL: se estiver usando connect
    // userDataDir: se estiver usando launch
    await bot.init({
      modo: "connect",
      browserURL: "http://127.0.0.1:9222",
      // modo: "launch",
      // userDataDir: "C:/meuPerfilChrome",
    });

    await bot.run();

  } catch (e) {
    console.error("ERRO:", e?.message || e);
  } finally {
    // await bot.close();
    console.log("Navegador mantido aberto (por padrão).");
  }
})();

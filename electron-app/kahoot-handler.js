const puppeteer = require('puppeteer');
const axios = require('axios');

class KahootHandler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.lastQuestion = '';
    }

    getGamePhase() {
        const url = this.page ? this.page.url() : '';
        if (url.includes('/instructions')) return 'attente';
        if (url.includes('/start')) return 'lancement';
        if (url.includes('/getready')) return 'getready';
        if (url.includes('/gameblock')) return 'question';
        if (url.includes('/answer/sent')) return 'reponse envoyee';
        if (url.includes('/answer/result')) return 'resultat';
        return 'inconnue';
    }

    async initialize() {
        console.log('Initialisation du navigateur...');
        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        });
        this.page = await this.browser.newPage();
        console.log('Navigateur initialisé');
        this.page.on('framenavigated', () => {
            const url = this.page.url();
            const phase = this.getGamePhase();
            console.log('Nouvelle URL :', url);
            console.log('Phase du jeu :', phase);
            this.currentPhase = phase;
        });
        this.currentPhase = this.getGamePhase();
        
        // Attendre que le réseau soit inactif (page complètement chargée)
        await this.page.setDefaultNavigationTimeout(30000); // 30 secondes timeout
    }

    async joinGame(pin, pseudo) {
        try {
            console.log('Navigation vers Kahoot...');
            await this.page.goto('https://kahoot.it/');
            console.log('Page Kahoot chargée');

            // Attendre que la page soit complètement chargée
            await new Promise(r => setTimeout(r, 5000));
            console.log('Délai d\'attente terminé');

            // Attendre que le champ PIN soit présent
            console.log('Recherche du champ PIN...');
            await this.page.waitForSelector('input[data-functional-selector="game-pin-input"]', { timeout: 10000 });
            console.log('Champ PIN trouvé');

            // Effacer le champ et entrer le PIN
            console.log('Saisie du PIN:', pin);
            await this.page.evaluate(() => {
                const input = document.querySelector('input[data-functional-selector="game-pin-input"]');
                input.value = '';
            });
            await this.page.type('input[data-functional-selector="game-pin-input"]', pin);
            console.log('PIN saisi');

            // Attendre un peu avant de cliquer
            await new Promise(r => setTimeout(r, 1000));

            // Cliquer sur le bouton
            console.log('Recherche du bouton...');
            await this.page.waitForSelector('button[data-functional-selector="join-game-pin"]', { timeout: 10000 });
            console.log('Bouton trouvé, clic en cours...');
            await this.page.click('button[data-functional-selector="join-game-pin"]');
            console.log('Bouton cliqué');

            // Attendre la page suivante
            console.log('Attente de la page de saisie du nom...');
            await this.page.waitForSelector('input[data-functional-selector="username-input"]', { timeout: 10000 });
            console.log('Page de saisie du nom chargée');

            // Remplir le pseudo
            console.log('Saisie du pseudo:', pseudo);
            await this.page.evaluate(() => {
                const input = document.querySelector('input[data-functional-selector="username-input"]');
                input.value = '';
            });
            await this.page.type('input[data-functional-selector="username-input"]', pseudo);
            console.log('Pseudo saisi');

            // Cliquer sur le bouton "OK, c'est parti !"
            await this.page.waitForSelector('button[data-functional-selector="join-button-username"]', { timeout: 10000 });
            await this.page.click('button[data-functional-selector="join-button-username"]');
            console.log('Bouton pseudo cliqué');

            return true;
        } catch (error) {
            console.error('Erreur détaillée:', error);
            return false;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async getCurrentAnswers() {
        if (!this.page) return [];
        return await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button[data-functional-selector^="answer-"]'));
            return buttons.map(btn => {
                const p = btn.querySelector('p');
                return p ? p.innerText.trim() : '';
            });
        });
    }

    async getCurrentQuestion() {
        if (!this.page) return '';
        return await this.page.evaluate(() => {
            // 1. Essayer le sélecteur habituel
            let el = document.querySelector('span[data-functional-selector="block-title"]');
            if (el && el.innerText.trim()) return el.innerText.trim();
            // 2. Sinon, chercher un <h1> visible avec du texte
            el = document.querySelector('h1');
            if (el && el.offsetParent !== null && el.innerText.trim()) return el.innerText.trim();
            // 3. Sinon, rien trouvé
            return '';
        });
    }

    async getCurrentScore() {
        if (!this.page) return '';
        return await this.page.evaluate(() => {
            const el = document.querySelector('div[data-functional-selector="bottom-bar-score"]');
            return el ? el.innerText.trim() : '';
        });
    }

    async getCurrentTimer() {
        if (!this.page) return '';
        return await this.page.evaluate(() => {
            const el = document.querySelector('div[data-functional-selector="question-countdown__count"]');
            return el ? el.innerText.trim() : '';
        });
    }

    async getCurrentQuestionAndAnswers() {
        if (!this.page) return { question: '', answers: [] };
        return await this.page.evaluate(() => {
            // Question
            let el = document.querySelector('span[data-functional-selector="block-title"]');
            let question = el && el.innerText.trim() ? el.innerText.trim() : '';
            if (!question) {
                el = document.querySelector('h1');
                if (el && el.offsetParent !== null && el.innerText.trim()) question = el.innerText.trim();
            }
            // Réponses
            const buttons = Array.from(document.querySelectorAll('button[data-functional-selector^="answer-"]'));
            const answers = buttons.map(btn => {
                const p = btn.querySelector('p');
                return p ? p.innerText.trim() : '';
            });
            return { question, answers };
        });
    }

    async answerWithOpenAI(apiKey) {
        const { question, answers } = await this.getCurrentQuestionAndAnswers();
        if (!question || !answers.length) return;
        if (this.lastQuestion === question) return; // Ne pas traiter deux fois la même question
        this.lastQuestion = question;
        // Prompt court et direct
        const prompt = `Voici une question de quiz et ses choix. Réponds uniquement par le numéro du choix correct (0, 1, 2 ou 3).\nQuestion : ${question}\nChoix :\n${answers.map((a, i) => i + '. ' + a).join('\n')}\nRéponds uniquement par le numéro.`;
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 5,
                temperature: 0
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const output = response.data.choices[0].message.content.trim();
            // Trouver l'index de la réponse
            const match = output.match(/\d/);
            if (match) {
                const idx = parseInt(match[0], 10);
                await this.clickAnswer(idx);
            }
            // Stocker la réponse IA pour affichage
            this.lastAIResponse = output;
        } catch (e) {
            this.lastAIResponse = 'Erreur IA: ' + (e.response?.data?.error?.message || e.message);
        }
    }

    async clickAnswer(idx) {
        if (!this.page) return;
        console.log('Tentative de clic ultra-robuste sur la réponse index :', idx);
        const urlBefore = this.page.url();
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await this.page.waitForSelector(`button[data-functional-selector="answer-${idx}"]:not([disabled])`, {visible: true, timeout: 1000});
                // Scroll dans la vue
                await this.page.evaluate((i) => {
                    const btn = document.querySelector(`button[data-functional-selector="answer-${i}"]`);
                    if (btn) btn.scrollIntoView({behavior: 'auto', block: 'center'});
                }, idx);
                // Essayer le clic Puppeteer natif
                try {
                    await this.page.click(`button[data-functional-selector="answer-${idx}"]`);
                    console.log(`Clic Puppeteer natif réussi sur le bouton ${idx}`);
                } catch (e) {
                    console.log(`Clic Puppeteer natif échoué :`, e.message);
                    // Si échec, tenter MouseEvent JS
                    const clicked = await this.page.evaluate((i) => {
                        const btn = document.querySelector(`button[data-functional-selector="answer-${i}"]`);
                        if (btn) {
                            ['mousedown', 'mouseup', 'click'].forEach(type => {
                                const evt = new MouseEvent(type, {bubbles: true, cancelable: true, view: window});
                                btn.dispatchEvent(evt);
                            });
                            return true;
                        }
                        return false;
                    }, idx);
                    if (clicked) {
                        console.log(`Clic MouseEvent JS réussi sur le bouton ${idx}`);
                    } else {
                        console.log(`Echec du clic MouseEvent JS sur le bouton ${idx}`);
                    }
                }
            } catch (e) {
                console.log(`Erreur lors du clic à l'essai ${attempt + 1} :`, e.message);
            }
            // Vérifier si l'URL a changé
            await new Promise(r => setTimeout(r, 300));
            const urlAfter = this.page.url();
            if (urlAfter !== urlBefore) {
                console.log('URL changée, clic validé, sortie de la boucle.');
                break;
            }
        }
    }

    getLastAIResponse() {
        return this.lastAIResponse || '';
    }

    // Surveiller les questions et répondre automatiquement
    async monitorQuestions(apiKey) {
        setInterval(() => {
            this.answerWithOpenAI(apiKey);
        }, 1000);
    }
}

module.exports = KahootHandler; 
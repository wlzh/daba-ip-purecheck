function app() {
  return {
    inputIp: '',
    autoIp: '',
    checking: false,
    data: null,
    activeTab: 'basic',
    lang: 'zh',
    webrtcResult: null,
    webrtcChecking: false,
    dnsResult: null,
    dnsChecking: false,
    ipv6Result: null,
    scoreAnimated: 0,
    aiResults: {},
    aiCheckingAll: false,
    copied: false,
    showHelp: false,
    userAgent: navigator.userAgent,
    fpPlatform: navigator.platform,
    fpLanguage: navigator.language,
    fpScreen: `${screen.width}x${screen.height}`,
    fpTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    fpWebGL: '',
    fpCanvasHash: '',

    tabs: [
      { id: 'basic', icon: '🌐' },
      { id: 'purity', icon: '🛡️' },
      { id: 'leak', icon: '🔍' },
      { id: 'ai', icon: '🤖' },
      { id: 'fingerprint', icon: '🔑' },
    ],

    init() {
      this.lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
      document.documentElement.lang = this.lang;
      this.detectWebGL();
      this.generateCanvasHash();
      this.detectIPv6();
      this.autoCheck();
    },

    t(key) {
      return window.i18n?.[this.lang]?.[key] || key;
    },

    toggleLang() {
      this.lang = this.lang === 'zh' ? 'en' : 'zh';
      document.documentElement.lang = this.lang;
    },

    async autoCheck() {
      this.checking = true;
      try {
        let res = await fetch('/api/check');
        let data = await res.json();

        // If no IP from backend (local dev), fetch IP from public API first
        if (data.error && !data.ip) {
          try {
            const ipRes = await fetch('https://api64.ipify.org?format=json');
            const ipData = await ipRes.json();
            if (ipData.ip) {
              this.autoIp = ipData.ip;
              this.inputIp = ipData.ip;
              res = await fetch(`/api/check?ip=${encodeURIComponent(ipData.ip)}`);
              data = await res.json();
            }
          } catch (e2) {
            console.error('Fallback IP detection failed:', e2);
          }
        }

        if (data.ip) {
          this.autoIp = data.ip;
          this.inputIp = data.ip;
          this.data = data;
          this.$nextTick(() => this.animateScore(data.purity.score));
        }
      } catch (e) {
        console.error('Auto check failed:', e);
      } finally {
        this.checking = false;
      }
    },

    async check() {
      const ip = this.inputIp.trim();
      if (!ip) return;
      this.checking = true;
      this.data = null;
      this.scoreAnimated = 0;
      try {
        const res = await fetch(`/api/check?ip=${encodeURIComponent(ip)}`);
        this.data = await res.json();
        this.$nextTick(() => this.animateScore(this.data.purity.score));
      } catch (e) {
        console.error('Check failed:', e);
      } finally {
        this.checking = false;
      }
    },

    animateScore(target) {
      let current = 0;
      const duration = 1500;
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * target);
        this.scoreAnimated = current;
        if (progress < 1) requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    },

    // ── WebRTC ──
    async checkWebRTC() {
      this.webrtcChecking = true;
      try {
        this.webrtcResult = await window.detectWebRTCLeaks();
      } catch (e) {
        this.webrtcResult = { error: e.message };
      } finally {
        this.webrtcChecking = false;
      }
    },

    get webrtcLeakSummary() {
      if (!this.webrtcResult || this.webrtcResult.error) return null;
      const mainIp = this.data?.ip;
      const publicIPs = this.webrtcResult.publicIPs || [];
      const localIPs = this.webrtcResult.localIPs || [];

      const hasLeakedLocal = localIPs.length > 0;
      const hasDifferentPublic = mainIp && publicIPs.some(ip => ip !== mainIp);

      if (hasLeakedLocal || hasDifferentPublic) {
        return { leaked: true, reason: hasLeakedLocal ? 'local' : 'mismatch' };
      }
      if (publicIPs.length > 0 && publicIPs.includes(mainIp)) {
        return { leaked: false, reason: 'match' };
      }
      if (publicIPs.length === 0 && localIPs.length === 0) {
        return { leaked: false, reason: 'blocked' };
      }
      return { leaked: true, reason: 'unknown' };
    },

    get webrtcLeakReasonText() {
      const s = this.webrtcLeakSummary;
      if (!s) return '';
      if (s.reason === 'local') return this.lang === 'zh' ? 'WebRTC 暴露了本地内网 IP' : 'WebRTC exposed local network IP';
      if (s.reason === 'mismatch') return this.lang === 'zh' ? 'WebRTC 暴露了与出口不同的公网 IP' : 'WebRTC exposed a different public IP';
      if (s.reason === 'match') return this.lang === 'zh' ? 'WebRTC IP 与出口 IP 一致，无异常' : 'WebRTC IP matches exit IP, no anomaly';
      if (s.reason === 'blocked') return this.lang === 'zh' ? 'WebRTC 已被正确屏蔽，无 IP 泄露' : 'WebRTC properly blocked, no IP leak';
      return '';
    },

    // ── DNS Leak ──
    async checkDnsLeak() {
      this.dnsChecking = true;
      this.dnsResult = null;
      try {
        // Use multiple DoH endpoints to test DNS consistency
        const tests = await Promise.allSettled([
          this.dnsResolve('cloudflare-dns.com', 'https://cloudflare-dns.com/dns-query'),
          this.dnsResolve('google-dns', 'https://dns.google/resolve?name=example.com&type=A'),
        ]);

        const mainIp = this.data?.ip || '';
        const results = [];

        // Test 1: Check if Cloudflare DoH is accessible
        const cfTest = tests[0];
        if (cfTest.status === 'fulfilled' && cfTest.value) {
          results.push({ name: 'Cloudflare DoH (1.1.1.1)', accessible: true });
        } else {
          results.push({ name: 'Cloudflare DoH (1.1.1.1)', accessible: false });
        }

        // Test 2: Check if Google DoH is accessible
        const googleTest = tests[1];
        if (googleTest.status === 'fulfilled' && googleTest.value) {
          results.push({ name: 'Google DoH (8.8.8.8)', accessible: true });
        } else {
          results.push({ name: 'Google DoH (8.8.8.8)', accessible: false });
        }

        // Test 3: HTTP IP consistency via backend
        try {
          const res = await fetch('/api/check');
          const data = await res.json();
          if (data.ip) {
            results.push({
              name: this.lang === 'zh' ? 'HTTP 出口 IP' : 'HTTP exit IP',
              accessible: true,
              ip: data.ip,
              match: data.ip === mainIp,
            });
          }
        } catch (e) {
          results.push({
            name: this.lang === 'zh' ? 'HTTP 出口 IP' : 'HTTP exit IP',
            accessible: false,
          });
        }

        this.dnsResult = {
          tests: results,
          consistent: results.every(r => r.match !== false),
          mainIp,
        };
      } catch (e) {
        this.dnsResult = { error: e.message };
      } finally {
        this.dnsChecking = false;
      }
    },

    async dnsResolve(label, url) {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/dns-json' },
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    // ── IPv6 ──
    async detectIPv6() {
      try {
        const res = await fetch('https://api64.ipify.org?format=json', {
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        if (data.ip) {
          const isV6 = data.ip.includes(':');
          this.ipv6Result = {
            address: data.ip,
            isV6,
            isLeak: isV6 && this.data?.ip && data.ip !== this.data.ip,
          };
        }
      } catch {
        this.ipv6Result = { error: this.lang === 'zh' ? '无 IPv6 连接' : 'No IPv6 connectivity' };
      }
    },

    // ── AI Services ──
    async checkAiService(name) {
      this.aiResults = { ...this.aiResults, [name]: 'checking' };
      const endpoints = {
        claude: 'https://claude.ai',
        chatgpt: 'https://chat.openai.com',
        gemini: 'https://gemini.google.com',
        copilot: 'https://copilot.microsoft.com',
      };
      const url = endpoints[name];
      if (!url) return;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        await fetch(url, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeout);
        this.aiResults = { ...this.aiResults, [name]: 'accessible' };
      } catch (e) {
        if (e.name === 'AbortError') {
          this.aiResults = { ...this.aiResults, [name]: 'timeout' };
        } else {
          this.aiResults = { ...this.aiResults, [name]: 'blocked' };
        }
      }
    },

    async checkAllAiServices() {
      this.aiCheckingAll = true;
      const services = ['claude', 'chatgpt', 'gemini', 'copilot'];
      await Promise.all(services.map(s => this.checkAiService(s)));
      this.aiCheckingAll = false;
    },

    getAiStatusLabel(status) {
      if (status === 'accessible') return this.t('accessible');
      if (status === 'blocked') return this.t('blocked');
      if (status === 'timeout') return this.t('unknown');
      return this.t('unknown');
    },

    getAiStatusBadge(status) {
      if (status === 'accessible') return 'badge-success';
      if (status === 'blocked') return 'badge-danger';
      return 'badge-neutral';
    },

    // ── Score & Helpers ──
    getScoreColor(score) {
      if (score >= 80) return 'var(--success)';
      if (score >= 50) return 'var(--warning)';
      return 'var(--danger)';
    },

    getScoreLabel(score) {
      if (score >= 90) return this.t('excellent');
      if (score >= 80) return this.t('good');
      if (score >= 50) return this.t('fair');
      return this.t('poor');
    },

    get scoreCircumference() {
      return 2 * Math.PI * 85;
    },

    get scoreOffset() {
      return this.scoreCircumference - (this.scoreAnimated / 100) * this.scoreCircumference;
    },

    countryFlag(code) {
      if (!code) return '';
      return code
        .toUpperCase()
        .split('')
        .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
        .join('');
    },

    async copyIp() {
      if (this.data?.ip) {
        await navigator.clipboard.writeText(this.data.ip);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2000);
      }
    },

    checkTimezoneMatch() {
      if (!this.data?.basic?.timezone) return null;
      return this.fpTimezone === this.data.basic.timezone;
    },

    checkLanguageMatch() {
      if (!this.data?.basic?.countryCode) return null;
      const country = this.data.basic.countryCode.toUpperCase();
      const lang = this.fpLanguage.toLowerCase();
      const map = {
        US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en',
        CN: 'zh', TW: 'zh', HK: 'zh',
        JP: 'ja', KR: 'ko', DE: 'de', FR: 'fr', ES: 'es',
      };
      const expected = map[country];
      if (!expected) return null;
      return lang.startsWith(expected);
    },

    detectWebGL() {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            this.fpWebGL = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          }
        }
      } catch (e) {}
    },

    generateCanvasHash() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('大坝 IP PureCheck 🛡️', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('fingerprint', 4, 35);
        const data = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
          const char = data.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash |= 0;
        }
        this.fpCanvasHash = Math.abs(hash).toString(16).padStart(8, '0');
      } catch (e) {}
    },
  };
}

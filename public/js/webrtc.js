window.detectWebRTCLeaks = async function() {
  const results = {
    localIPs: [],
    publicIPs: [],
    allIPs: [],
    leaked: false,
    ipv6Leaked: false,
    stunResults: [],
    error: null,
  };

  if (typeof RTCPeerConnection === 'undefined') {
    results.error = 'WebRTC not supported';
    return results;
  }

  const stunServers = [
    { urls: 'stun:stun.l.google.com:19302', name: 'Google STUN 1' },
    { urls: 'stun:stun1.l.google.com:19302', name: 'Google STUN 2' },
    { urls: 'stun:stun2.l.google.com:19302', name: 'Google STUN 3' },
    { urls: 'stun:stun3.l.google.com:19302', name: 'Google STUN 4' },
    { urls: 'stun:stun4.l.google.com:19302', name: 'Google STUN 5' },
    { urls: 'stun:stun.stunprotocol.org:3478', name: 'StunProtocol' },
    { urls: 'stun:stun.voip.eutelia.it:3478', name: 'Eutelia STUN' },
  ];

  const pc = new RTCPeerConnection({
    iceServers: stunServers,
  });

  pc.createDataChannel('');

  const ips = new Map();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pc.close();
      finalize();
    }, 8000);

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        clearTimeout(timeout);
        pc.close();
        finalize();
        return;
      }

      const candidate = event.candidate.candidate;

      const ipv4Match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (ipv4Match) {
        const ip = ipv4Match[1];
        if (!ips.has(ip)) {
          ips.set(ip, { type: isPrivateIP(ip) ? 'local' : 'public', version: 4 });
        }
      }

      const ipv6Match = candidate.match(/([a-f0-9]{1,4}(:[a-f0-9]{1,4}){5,7})/i);
      if (ipv6Match && !ipv6Match[1].includes('::')) {
        const ip = ipv6Match[1];
        if (!ips.has(ip)) {
          ips.set(ip, { type: isLinkLocalIPv6(ip) ? 'local' : 'public', version: 6 });
        }
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((e) => {
        clearTimeout(timeout);
        results.error = e.message;
        resolve(results);
      });

    function finalize() {
      const allIPs = [...ips.entries()].map(([ip, info]) => ({ ip, ...info }));
      results.allIPs = allIPs;
      results.localIPs = allIPs.filter((i) => i.type === 'local').map((i) => i.ip);
      results.publicIPs = allIPs.filter((i) => i.type === 'public').map((i) => i.ip);
      results.ipv6Leaked = allIPs.some((i) => i.version === 6 && i.type === 'public');
      results.leaked = results.localIPs.length > 0 || results.publicIPs.length > 0;

      stunServers.forEach((s) => {
        results.stunResults.push({
          server: s.name,
          ips: results.publicIPs.length > 0 ? results.publicIPs : ['N/A'],
        });
      });

      resolve(results);
    }
  });
};

function isPrivateIP(ip) {
  if (ip === '0.0.0.0') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (ip.startsWith('169.254.')) return true;
  return false;
}

function isLinkLocalIPv6(ip) {
  return ip.toLowerCase().startsWith('fe80');
}

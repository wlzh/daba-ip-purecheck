interface Env {}

interface IPWhoResponse {
  ip: string;
  success: boolean;
  type: string;
  country: string;
  country_code: string;
  region: string;
  region_code: string;
  city: string;
  latitude: number;
  longitude: number;
  postal: string;
  connection: {
    asn: number;
    org: string;
    isp: string;
    domain: string;
  };
  timezone: {
    id: string;
  };
}

interface IPApiResponse {
  status: string;
  country: string;
  countryCode: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  mobile: boolean;
  proxy: boolean;
  hosting: boolean;
  query: string;
}

interface CheckResult {
  ip: string;
  basic: {
    country: string;
    countryCode: string;
    region: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
  };
  purity: {
    score: number;
    ipType: string;
    isProxy: boolean;
    isHosting: boolean;
    isMobile: boolean;
    riskLevel: string;
    penalties: { key: string; points: number }[];
  };
  cf: {
    country: string | null;
    colo: string | null;
  };
}

function classifyIP(org: string, isp: string, domain: string): {
  isHosting: boolean;
  isProxy: boolean;
  isMobile: boolean;
  ipType: string;
} {
  const combined = `${org} ${isp} ${domain}`.toLowerCase();
  const hostingKeywords = [
    'hosting', 'cloud', 'datacenter', 'data center', 'server', 'vps',
    'digitalocean', 'amazon', 'aws', 'google cloud', 'gcp', 'microsoft',
    'azure', 'oracle cloud', 'vultr', 'linode', 'akamai', 'hetzner',
    'ovh', 'scaleway', 'upcloud', 'kamatera', 'contabo', 'ionos',
    'choopa', 'm247', 'quadranet', 'psychz', 'buyvm', 'hostwinds',
    'leaseweb', 'serverius', 'datacamp', 'ponynet', 'packet host',
    'softlayer', 'rackspace', 'cloudflare', 'google llc',
    'facebook', 'meta platforms', 'twitter', 'netflix', 'fastly',
  ];
  const mobileKeywords = [
    'mobile', 'wireless', 'cellular', 'gsm', 'lte', '5g', '4g',
    'telecom', 't-mobile', 'verizon wireless', 'at&t mobility',
    'sprint', 'vodafone', 'orange', 'telekom', 'china mobile',
    'china unicom', 'china telecom',
  ];

  const isHosting = hostingKeywords.some((k) => combined.includes(k));
  const isMobile = mobileKeywords.some((k) => combined.includes(k));
  const isProxy = false; // Requires ip-api.com for accurate detection

  let ipType = 'residential';
  if (isHosting) ipType = 'datacenter';
  else if (isMobile) ipType = 'mobile';

  return { isHosting, isProxy, isMobile, ipType };
}

function calculatePurityScore(info: {
  isProxy: boolean;
  isHosting: boolean;
  isMobile: boolean;
}): {
  score: number;
  ipType: string;
  penalties: { key: string; points: number }[];
} {
  let score = 100;
  const penalties: { key: string; points: number }[] = [];
  let ipType = 'residential';

  if (info.isProxy) {
    score -= 35;
    penalties.push({ key: 'proxy', points: -35 });
    ipType = 'proxy';
  }

  if (info.isHosting) {
    score -= 30;
    penalties.push({ key: 'hosting', points: -30 });
    if (ipType !== 'proxy') ipType = 'datacenter';
  }

  if (info.isMobile) {
    score -= 5;
    penalties.push({ key: 'mobile', points: -5 });
    if (ipType === 'residential') ipType = 'mobile';
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    ipType,
    penalties,
  };
}

async function fetchFromIPWho(ip: string): Promise<IPWhoResponse | null> {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data: IPWhoResponse = await res.json();
    if (data.success) return data;
    return null;
  } catch {
    return null;
  }
}

async function fetchFromIPApi(ip: string): Promise<IPApiResponse | null> {
  try {
    const fields = 'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query';
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data: IPApiResponse = await res.json();
    if (data.status === 'success') return data;
    return null;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  let ip = url.searchParams.get('ip') || '';
  if (!ip) {
    const cfIp = request.headers.get('CF-Connecting-IP');
    if (cfIp && cfIp !== '127.0.0.1' && !cfIp.startsWith('::1')) ip = cfIp;
  }
  if (!ip) {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0].trim();
      if (first && first !== '127.0.0.1' && !first.startsWith('::1')) ip = first;
    }
  }

  if (!ip) {
    return new Response(JSON.stringify({ error: 'no_ip', message: 'No IP detected. Please enter an IP address.' }), {
      status: 200,
      headers: corsHeaders(),
    });
  }

  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (!ipRegex.test(ip) && !ipv6Regex.test(ip)) {
    return new Response(JSON.stringify({ error: 'Invalid IP address' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  // Try ip-api.com first (has proxy/hosting/mobile flags)
  const ipApiData = await fetchFromIPApi(ip);
  if (ipApiData) {
    const { score, ipType, penalties } = calculatePurityScore({
      isProxy: ipApiData.proxy,
      isHosting: ipApiData.hosting,
      isMobile: ipApiData.mobile,
    });
    const result: CheckResult = {
      ip: ipApiData.query,
      basic: {
        country: ipApiData.country,
        countryCode: ipApiData.countryCode,
        region: ipApiData.regionName,
        city: ipApiData.city,
        zip: ipApiData.zip,
        lat: ipApiData.lat,
        lon: ipApiData.lon,
        timezone: ipApiData.timezone,
        isp: ipApiData.isp,
        org: ipApiData.org,
        as: ipApiData.as,
      },
      purity: {
        score,
        ipType,
        isProxy: ipApiData.proxy,
        isHosting: ipApiData.hosting,
        isMobile: ipApiData.mobile,
        riskLevel: score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high',
        penalties,
      },
      cf: {
        country: request.headers.get('CF-IPCountry'),
        colo: (request.headers.get('CF-Ray') || '').split('-').pop() || null,
      },
    };
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders(), 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Fallback: ipwho.is (HTTPS, no proxy detection but has geo/org data)
  const whoData = await fetchFromIPWho(ip);
  if (whoData) {
    const { isHosting, isProxy, isMobile } = classifyIP(
      whoData.connection?.org || '',
      whoData.connection?.isp || '',
      whoData.connection?.domain || '',
    );
    const { score, ipType, penalties } = calculatePurityScore({ isProxy, isHosting, isMobile });

    const result: CheckResult = {
      ip: whoData.ip,
      basic: {
        country: whoData.country,
        countryCode: whoData.country_code,
        region: whoData.region,
        city: whoData.city,
        zip: whoData.postal,
        lat: whoData.latitude,
        lon: whoData.longitude,
        timezone: whoData.timezone?.id || '',
        isp: whoData.connection?.isp || '',
        org: whoData.connection?.org || '',
        as: whoData.connection?.asn ? `AS${whoData.connection.asn}` : '',
      },
      purity: {
        score,
        ipType,
        isProxy,
        isHosting,
        isMobile,
        riskLevel: score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high',
        penalties,
      },
      cf: {
        country: request.headers.get('CF-IPCountry'),
        colo: (request.headers.get('CF-Ray') || '').split('-').pop() || null,
      },
    };
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders(), 'Cache-Control': 'public, max-age=300' },
    });
  }

  return new Response(JSON.stringify({ error: 'IP lookup failed' }), {
    status: 502,
    headers: corsHeaders(),
  });
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
}

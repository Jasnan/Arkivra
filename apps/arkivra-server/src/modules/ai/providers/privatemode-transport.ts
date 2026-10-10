/** Plaintext may reach only a local proxy, or an explicitly trusted private network. */
export function validatePrivatemodeProxyUrl(value: string, env = process.env) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Privatemode proxy URL must be a valid HTTP(S) URL.');
  }
  const hostname = url.hostname.replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.search || url.hash
  ) throw new Error('Privatemode proxy URL must be an HTTP(S) URL without credentials, query, or fragment.');
  if (hostname === 'api.privatemode.ai') {
    throw new Error('Configure a local Privatemode encryption proxy, not api.privatemode.ai.');
  }
  const loopback = ['localhost', '[::1]'].includes(hostname) || /^127\.\d+\.\d+\.\d+$/.test(hostname);
  if (url.protocol === 'http:' && !loopback && env.ARKIVRA_PRIVATEMODE_ALLOW_PRIVATE_HTTP !== 'true') {
    throw new Error('Use HTTPS for a remote Privatemode proxy; private same-host networks require explicit ARKIVRA_PRIVATEMODE_ALLOW_PRIVATE_HTTP=true.');
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Privatemode requires TLS certificate verification; remove NODE_TLS_REJECT_UNAUTHORIZED=0.');
  }
  return url;
}

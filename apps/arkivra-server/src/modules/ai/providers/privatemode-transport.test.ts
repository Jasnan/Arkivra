import { describe, expect, it } from 'vitest';
import { validatePrivatemodeProxyUrl } from './privatemode-transport.js';

describe('privatemode transport boundary', () => {
  it('permits loopback HTTP and certificate-verified HTTPS', () => {
    for (const url of ['http://127.0.0.1:8080/v1', 'http://localhost:8080/v1', 'http://[::1]:8080/v1', 'https://proxy.example/v1']) {
      expect(validatePrivatemodeProxyUrl(url, {}).href).toBe(new URL(url).href);
    }
  });
  it('requires explicit same-host private-network consent for other HTTP addresses', () => {
    for (const url of ['http://proxy.example/v1', 'http://192.168.1.2:8080/v1', 'http://privatemode-proxy:8080/v1']) {
      expect(() => validatePrivatemodeProxyUrl(url, {})).toThrow('Use HTTPS');
    }
    expect(validatePrivatemodeProxyUrl('http://privatemode-proxy:8080/v1', { ARKIVRA_PRIVATEMODE_ALLOW_PRIVATE_HTTP: 'true' }).protocol).toBe('http:');
  });
  it('rejects direct API bypass, credentials, URL metadata and insecure TLS', () => {
    for (const url of ['https://api.privatemode.ai/v1', 'https://api.privatemode.ai./v1', 'http://user:secret@localhost:8080', 'http://localhost:8080?key=secret', 'http://localhost:8080#secret', 'file:///tmp/proxy']) {
      expect(() => validatePrivatemodeProxyUrl(url, {})).toThrow();
    }
    expect(() => validatePrivatemodeProxyUrl('https://proxy.example/v1', { NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow('TLS certificate verification');
    expect(() => validatePrivatemodeProxyUrl('secret-not-a-url', {})).toThrow('valid HTTP(S) URL');
  });
});

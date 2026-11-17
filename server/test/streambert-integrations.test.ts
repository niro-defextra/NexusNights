import test from 'node:test';
import assert from 'node:assert/strict';
import { aniSkipService } from '../src/streaming/aniskip-service';
import { extractSubtitleFromZip } from '../src/subtitles/subdl-api';
import { wyzieAPI } from '../src/subtitles/wyzie-api';
import { unifiedSubtitles } from '../src/subtitles/unified-subtitles';
import { VidriftAdapter } from '../src/streaming/adapters/vidrift-adapter';
import { VidfastAdapter } from '../src/streaming/adapters/vidfast-adapter';
import { AetherAdapter } from '../src/streaming/adapters/aether-adapter';
import { VidloveAdapter } from '../src/streaming/adapters/vidlove-adapter';
import zlib from 'node:zlib';

test('Adapters: Vidrift, Vidfast, Aether, Vidlove generate valid embed URLs', async () => {
  const vidrift = new VidriftAdapter();
  const vidfast = new VidfastAdapter();
  const aether = new AetherAdapter();
  const vidlove = new VidloveAdapter();

  const req = { kind: 'movie' as const, tmdbId: 550 };

  const r1 = await vidrift.resolve(req);
  assert.equal(r1.sources.length, 1);
  assert.ok(r1.sources[0].url.includes('vidrift.net/embed/movie/550'));
  assert.ok(r1.sources[0].url.includes('sub=ar'));

  const r2 = await vidfast.resolve(req);
  assert.equal(r2.sources.length, 1);
  assert.ok(r2.sources[0].url.includes('vidfast.vc/movie/550'));

  const r3 = await aether.resolve(req);
  assert.equal(r3.sources.length, 1);
  assert.ok(r3.sources[0].url.includes('aether.ist/media/tmdb-movie-550'));

  const r4 = await vidlove.resolve(req);
  assert.equal(r4.sources.length, 1);
  assert.ok(r4.sources[0].url.includes('player.vidlove.cc/embed/movie/550'));
});

test('AniSkipService: fetches valid skip times for Attack on Titan', async () => {
  // MAL ID: 16498 (Attack on Titan S1), Episode 1
  const result = await aniSkipService.getSkipTimes(16498, 1);
  assert.equal(result.found, true);
  assert.ok(result.intro, 'Intro timing should be found');
  assert.ok(result.intro!.startTime > 0);
  assert.ok(result.intro!.endTime > result.intro!.startTime);
});

test('SubDL: in-memory ZIP extractor decompresses SRT safely', () => {
  // Construct a minimal uncompressed ZIP in memory containing sample.srt
  const content = Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nHello World\n', 'utf8');
  const filename = 'test.srt';
  const fnBuf = Buffer.from(filename, 'utf8');

  // ZIP Local File Header (30 bytes + filename + data)
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // Local file header signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // general purpose bit flag
  header.writeUInt16LE(0, 8); // compression method (0 = stored)
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(0, 14); // crc32
  header.writeUInt32LE(content.length, 18); // compressed size
  header.writeUInt32LE(content.length, 22); // uncompressed size
  header.writeUInt16LE(fnBuf.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length

  const zipBuffer = Buffer.concat([header, fnBuf, content]);
  const extracted = extractSubtitleFromZip(zipBuffer);

  assert.ok(extracted, 'Should successfully extract subtitle from zip');
  assert.equal(extracted.name, 'test.srt');
  assert.equal(extracted.data.toString('utf8'), content.toString('utf8'));
});

test('UnifiedSubtitles: resolves download links for Wyzie and SubDL', async () => {
  const wyzieLink = await unifiedSubtitles.getDownloadLink('wyzie:' + encodeURIComponent('https://example.com/sample.srt'));
  assert.equal(wyzieLink.link, 'https://example.com/sample.srt');

  const subdlLink = await unifiedSubtitles.getDownloadLink('subdl:' + encodeURIComponent('https://dl.subdl.com/sub.zip'));
  assert.ok(subdlLink.link.includes('/api/subtitles/subdl-stream'));
});

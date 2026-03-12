import { Injectable, Logger, BadRequestException, BadGatewayException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async runStrict(opts: any) {
    // opts may contain: uuids[], limitUuids, dryRun, since, until, all
    const jobTs = Date.now();
    const missingOut = path.join(process.cwd(), 'tmp', `job_${jobTs}_missing.ndjson`);

    // 1) explicit uuids supplied -> call audit-copy-dryrun with repeated --uuid
    if (Array.isArray(opts.uuids) && opts.uuids.length) {
      const args: string[] = [];
      if (opts.dryRun) args.push('--dry-run');
      for (const u of opts.uuids) args.push('--uuid', String(u));
      args.push('--missing-out', missingOut);
      return this.spawnScript('audit-copy-dryrun.sh', args);
    }

    // 2) date window supplied -> fetch GeoSuivi list and filter by date
    const hasSince = opts.since && String(opts.since).trim() !== '';
    const hasUntil = opts.until && String(opts.until).trim() !== '';
    if (hasSince || hasUntil) {
      const listUrl = process.env.GEOSUIVI_GETRAPPORTLIST_URL || process.env.GEOSUIVI_API_URL;
      if (!listUrl) throw new BadRequestException('GeoSuivi list URL not configured in environment. Set GEOSUIVI_GETRAPPORTLIST_URL');

      const since = hasSince ? new Date(opts.since) : null;
      const until = hasUntil ? new Date(opts.until) : null;
      this.logger.log(`Fetching GeoSuivi list from ${listUrl} to filter by date window`);
      let resp;
      try {
        resp = await axios.get(listUrl, { timeout: 90000 });
      } catch (err) {
        this.logger.error('Failed to fetch GeoSuivi list', err as any);
        throw new BadGatewayException('Failed to fetch GeoSuivi list: ' + String((err as any)?.message || err));
      }
      const items = Array.isArray(resp.data) ? resp.data : resp.data?.results || [];
      const picked: string[] = [];
      for (const r of items) {
        // require flagged reports
        if (!('flag_rapport' in r)) continue;
        const flag = r.flag_rapport;
        if (!(flag === 1 || flag === '1' || flag === true)) continue;

        // find a date-like property
        let dt: Date | null = null;
        for (const k of Object.keys(r)) {
          const v = r[k];
          if (!v) continue;
          if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) {
            const d = new Date(v);
            if (!isNaN(d.getTime())) { dt = d; break; }
          }
          if (typeof v === 'number') {
            const d = new Date(v);
            if (!isNaN(d.getTime())) { dt = d; break; }
          }
        }
        if (since && dt && dt < since) continue;
        if (until && dt && dt > until) continue;
        const id = r.uuid || r._id || r.id;
        if (id) picked.push(String(id));
      }

      if (!picked.length) return { id: String(jobTs), picked: 0 };
      const args: string[] = [];
      if (opts.dryRun) args.push('--dry-run');
      for (const u of picked) args.push('--uuid', u);
      args.push('--missing-out', missingOut);
      return this.spawnScript('audit-copy-dryrun.sh', args);
    }

    // 3) default global audit (with optional limit)
    const args: string[] = [];
    if (opts.limitUuids) args.push('--limit-rapports', String(opts.limitUuids));
    if (opts.dryRun) args.push('--dry-run');
    args.push('--missing-out', missingOut);
    return this.spawnScript('audit-copy-dryrun.sh', args);
  }

  runRepair(opts: any) {
    // opts: { input?, uuids?, concurrency?, overwrite?, dryRun? }
    const jobTs = Date.now();
    const args: string[] = [];

    if (opts.input) {
      args.push('--missing-out', String(opts.input));
      if (opts.concurrency) args.push('--concurrency', String(opts.concurrency));
      if (opts.overwrite) args.push('--overwrite');
      if (opts.dryRun) args.push('--dry-run');
      return this.spawnScript('repair-uuids.sh', args);
    }

    if (Array.isArray(opts.uuids) && opts.uuids.length) {
      const missingOut = path.join(process.cwd(), 'tmp', `job_${jobTs}_missing.ndjson`);
      const lines = opts.uuids.map((u: string) => JSON.stringify({ uuid: u }));
      fs.writeFileSync(missingOut, lines.join('\n'));
      args.push('--missing-out', missingOut);
      if (opts.concurrency) args.push('--concurrency', String(opts.concurrency));
      if (opts.overwrite) args.push('--overwrite');
      if (opts.dryRun) args.push('--dry-run');
      return this.spawnScript('repair-uuids.sh', args);
    }
    throw new BadRequestException('runRepair requires either `input` (NDJSON path) or `uuids` array');
  }

  status(id: string) {
    const p = path.join(process.cwd(), 'tmp', `job_${id}.log`);
    if (fs.existsSync(p)) {
      return { id, log: fs.readFileSync(p, 'utf8') };
    }
    return { id, status: 'unknown' };
  }

  private spawnScript(name: string, args: string[]) {
    const script = path.join(process.cwd(), 'scripts', 'commands', name);
    const id = String(Date.now());
    const outLog = path.join(process.cwd(), 'tmp', `job_${id}.log`);
    let child;
    try {
      child = spawn(script, args, { env: process.env, shell: true });
    } catch (err) {
      try { fs.writeFileSync(outLog, `spawn-error: ${String(err)}`); } catch (e) {}
      return { id, pid: 0, error: String(err) };
    }
    const chunks: string[] = [];
    if (child.stdout) child.stdout.on('data', (d) => chunks.push(String(d)));
    if (child.stderr) child.stderr.on('data', (d) => chunks.push(String(d)));
    child.on('close', (code) => {
      chunks.push(`exit ${code}`);
      try { fs.writeFileSync(outLog, chunks.join('')); } catch (e) { /* ignore */ }
    });
    return { id, pid: child.pid };
  }
}

## Intégration React — affichage des médias ODK

Petit guide pour afficher les images stockées dans DigitalOcean Spaces (CDN) depuis un frontend React.

### Principe
- Préférence d'URL : `attachment.s3` (CDN public) → `attachment.proxyUrl` (backend proxy) → URL signée (si Space privé).
- CORS : autoriser votre domaine pour `GET, HEAD, OPTIONS` sur le Space/CDN.

### Variables d'environnement requises
- `S3_CDN` : URL du CDN (ex: `https://du-medias.sfo3.cdn.digitaloceanspaces.com`)
- `S3_USE_CDN=true` si vous voulez préférer le CDN

### Endpoint backend recommandés
- `GET /api/submissions?formId=<formId>`
  - Renvoie JSON des submissions depuis MongoDB, chaque document contenant `attachments` avec au moins `{ filename, s3, proxyUrl, fieldPath }`.
- `GET /api/signed-url?key=<objectKey>` (optionnel)
  - Retourne `{ url }` — URL signée courte durée pour objets privés.

### Exemple de composant React (affichage simple)
```jsx
// components/SubmissionsList.jsx
import React, { useEffect, useState } from "react";

export default function SubmissionsList({ formId }) {
  const [subs, setSubs] = useState([]);
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/submissions?formId=${encodeURIComponent(formId)}`);
      const data = await res.json();
      setSubs(data);
    }
    load();
  }, [formId]);

  return (
    <div>
      {subs.map((s) => (
        <article key={s.instanceId} style={{ border: '1px solid #eee', padding: 12, margin: 8 }}>
          <h4>{s.instanceId}</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {s.attachments?.map((att) => (
              <figure key={att.filename} style={{ width: 180 }}>
                <img
                  src={att.s3 || att.proxyUrl}
                  alt={att.filename}
                  loading="lazy"
                  style={{ width: '100%', height: 120, objectFit: 'cover', background: '#f6f6f6' }}
                  onError={(e) => { if (att.s3 && att.proxyUrl) e.currentTarget.src = att.proxyUrl; }}
                />
                <figcaption style={{ fontSize: 12 }}>{att.fieldPath} — {att.filename}</figcaption>
              </figure>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
```

### Exemple backend : endpoint signé (Node + Express + AWS SDK v3)
```js
import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = express.Router();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

router.get('/signed-url', async (req, res) => {
  const { key } = req.query;
  const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 }); // 60s
  res.json({ url });
});

export default router;
```

### Vérifications & debug
- Tester HEAD via CDN :
```bash
curl -I "${S3_CDN}/<prefix>/<object>.jpg"
```
- Si `403` : vérifier `Restrict files` et ACLs, ou utiliser URL signée.

### Conseils pratiques
- Utilisez `loading="lazy"` et placeholders pour la performance.
- Laissez le CDN gérer `Cache-Control` si possible.
- Pour contenus sensibles, préférez URLs signées.

---
Fichier ajouté pour intégration rapide dans un projet React. Si vous voulez, j'ajoute un endpoint de démonstration `/api/submissions` dans le repo pour servir des documents factices.

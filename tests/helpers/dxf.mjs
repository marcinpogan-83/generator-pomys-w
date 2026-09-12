// Minimalny parser par (kod, wartosc) DXF - do testow strukturalnych w Node.
// Pelna walidacja semantyczna odbywa sie w tests/python (ezdxf).

export function parseTags(text) {
  const lines = text.split(/\r\n|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  const tags = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    tags.push([Number(lines[i].trim()), lines[i + 1]]);
  }
  return tags;
}

export function sections(tags) {
  const out = {};
  let name = null, buf = null;
  for (let i = 0; i < tags.length; i++) {
    const [code, value] = tags[i];
    if (code === 0 && value === 'SECTION') { name = tags[i + 1][1]; buf = []; i++; continue; }
    if (code === 0 && value === 'ENDSEC') { out[name] = buf; name = null; buf = null; continue; }
    if (buf) buf.push([code, value]);
  }
  return out;
}

// Dzieli sekcje ENTITIES na encje: [{type, tags: Map-like array}]
export function entities(sectionTags) {
  const out = [];
  let cur = null;
  for (const [code, value] of sectionTags) {
    if (code === 0) {
      if (value === 'VERTEX' && cur && cur.type === 'POLYLINE') { cur.vertices.push({}); cur.inVertex = true; continue; }
      if (value === 'SEQEND') { if (cur) cur.inVertex = false; continue; }
      cur = { type: value, tags: [], vertices: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (cur.inVertex) {
      const v = cur.vertices[cur.vertices.length - 1];
      if (code === 10) v.x = Number(value);
      if (code === 20) v.y = Number(value);
    } else {
      cur.tags.push([code, value]);
    }
  }
  return out;
}

export function tagValue(entity, code) {
  const hit = entity.tags.find(t => t[0] === code);
  return hit ? hit[1] : undefined;
}

export function layerOf(entity) { return tagValue(entity, 8); }
export function isClosed(entity) { return Number(tagValue(entity, 70) || 0) === 1; }

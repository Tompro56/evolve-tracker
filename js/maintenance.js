// ============================================================
// RIDE TRACKER - Module Entretien / Interventions
// ============================================================

const Maintenance = {};

let currentMaintenanceSort = { by: 'date', order: 'desc' };
let currentMaintenanceSearch = '';

// --- Formulaire nouvelle / édition intervention ---
Maintenance.openInterventionForm = async function (interventionId = null) {
  const deviceId = await Devices.getCurrentId();
  const interventionTypes = await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTION_TYPES);
  const parts = (await EvolveDB.dbGetAll(EvolveDB.STORES.PARTS)).filter(p => p.deviceId === deviceId);
  let intervention = null;
  if (interventionId) intervention = await EvolveDB.dbGet(EvolveDB.STORES.INTERVENTIONS, interventionId);

  const selectedTypes = intervention ? intervention.interventionTypes : [];
  const selectedParts = intervention ? intervention.parts : []; // [{partName, budget, comment}]

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>${intervention ? 'Modifier l\'intervention' : 'Nouvelle intervention'}</h2>
      <button class="modal-close" id="int-form-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>

    <div class="form-group">
      <label class="form-label">Type d'intervention</label>
      <div class="checkbox-list" id="int-type-list">
        ${interventionTypes.map(it => `
          <div class="checkbox-row">
            <input type="checkbox" id="int-type-${it.id}" value="${it.name}" ${selectedTypes.includes(it.name) ? 'checked' : ''}>
            <label for="int-type-${it.id}">${it.name}</label>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Parties concernées</label>
      ${parts.length === 0 ? `
        <div class="empty-state" style="padding:14px;text-align:left">
          <p style="margin:0">Aucune pièce configurée pour cet appareil. Ajoute-les dans Réglages &gt; Appareil pour pouvoir les associer ici (facultatif).</p>
        </div>
      ` : `
      <div class="parts-select-actions">
        <button type="button" class="btn-link" id="int-parts-select-all">Tout sélectionner</button>
        <button type="button" class="btn-link" id="int-parts-deselect-all">Tout désélectionner</button>
      </div>
      <div class="checkbox-list" id="int-parts-list">
        ${parts.map(p => {
          const existing = selectedParts.find(sp => sp.partName === p.name);
          const hasContent = existing && ((existing.budget !== undefined && existing.budget !== null && existing.budget !== '') || (existing.comment && existing.comment.trim() !== ''));
          return `
          <div class="checkbox-row">
            <input type="checkbox" class="part-checkbox" id="int-part-${p.id}" value="${p.name}" ${existing ? 'checked' : ''}>
            <label for="int-part-${p.id}">${p.name}</label>
            <button type="button" class="part-details-toggle${existing ? '' : ' hidden'}" data-part-id="${p.id}" aria-expanded="false">détails<span class="part-filled-dot${hasContent ? '' : ' hidden'}"></span></button>
          </div>
          <div class="part-detail-fields hidden" id="part-detail-${p.id}" style="padding-left:29px;margin-bottom:10px">
            <div class="form-group mb-0" style="margin-bottom:8px">
              <div class="input-with-unit">
                <input type="number" class="form-input mono budget-input" placeholder="0" step="0.01" min="0" value="${existing ? existing.budget || '' : ''}" data-part="${p.name}">
                <span class="unit-suffix">€</span>
              </div>
            </div>
            <textarea class="form-textarea comment-input" maxlength="200" placeholder="Commentaire (marque, référence...) - 200 caractères max" data-part="${p.name}" style="min-height:50px;font-size:13px">${existing ? existing.comment || '' : ''}</textarea>
            <div class="char-counter">0/200</div>
          </div>
        `;
        }).join('')}
      </div>
      `}
    </div>

    <div class="form-group">
      <label class="form-label">Commentaire général</label>
      <textarea class="form-textarea" id="int-general-comment" placeholder="Note libre sur l'intervention">${intervention ? intervention.generalComment || '' : ''}</textarea>
    </div>

    ${intervention ? `
    <div class="form-group">
      <label class="form-label">Date et heure</label>
      <input type="datetime-local" class="form-input mono" id="int-timestamp" value="${toDatetimeLocalStr(intervention.timestamp)}">
    </div>
    ` : `<div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:16px">Date et heure enregistrées automatiquement.</div>`}

    <div class="modal-actions">
      ${intervention ? `<button class="btn btn-danger" id="int-delete-btn">Supprimer</button>` : ''}
      <button class="btn btn-primary flex-1" id="int-save-btn">Enregistrer</button>
    </div>
  `;

  // La case ne déploie plus les champs : elle montre/masque seulement le lien "détails".
  // Le déploiement des champs budget/commentaire passe uniquement par ce lien, par pièce.
  parts.forEach(p => {
    const checkbox = document.getElementById(`int-part-${p.id}`);
    const detailFields = document.getElementById(`part-detail-${p.id}`);
    const toggle = sheet.querySelector(`.part-details-toggle[data-part-id="${p.id}"]`);
    if (!checkbox || !toggle) return;

    checkbox.onchange = () => {
      if (checkbox.checked) {
        toggle.classList.remove('hidden');
      } else {
        toggle.classList.add('hidden');
        detailFields.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      }
    };

    toggle.onclick = () => {
      const nowHidden = detailFields.classList.toggle('hidden');
      toggle.setAttribute('aria-expanded', String(!nowHidden));
    };
  });

  // Sélection groupée : coche/décoche tout sans déployer aucun champ.
  const selectAllBtn = document.getElementById('int-parts-select-all');
  const deselectAllBtn = document.getElementById('int-parts-deselect-all');
  if (selectAllBtn) selectAllBtn.onclick = () => {
    parts.forEach(p => {
      const cb = document.getElementById(`int-part-${p.id}`);
      if (cb && !cb.checked) { cb.checked = true; cb.onchange(); }
    });
  };
  if (deselectAllBtn) deselectAllBtn.onclick = () => {
    parts.forEach(p => {
      const cb = document.getElementById(`int-part-${p.id}`);
      if (cb && cb.checked) { cb.checked = false; cb.onchange(); }
    });
  };

  // Compteur de caractères
  sheet.querySelectorAll('.comment-input').forEach(textarea => {
    const counter = textarea.nextElementSibling;
    const updateCounter = () => {
      const len = textarea.value.length;
      counter.textContent = `${len}/200`;
      counter.classList.toggle('warn', len > 180);
    };
    updateCounter();
    textarea.addEventListener('input', updateCounter);
  });

  document.getElementById('int-form-close').onclick = closeModal;
  document.getElementById('int-save-btn').onclick = () => saveInterventionForm(interventionId);
  if (intervention) {
    document.getElementById('int-delete-btn').onclick = async () => {
      if (await confirmDialog('Supprimer cette intervention ?', { confirmLabel: 'Supprimer', danger: true })) {
        await EvolveDB.dbDelete(EvolveDB.STORES.INTERVENTIONS, interventionId);
        closeModal();
        showToast('Intervention supprimée', 'success');
        Maintenance.renderList();
      }
    };
  }

  openModal();
};

function toDatetimeLocalStr(isoString) {
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveInterventionForm(interventionId) {
  const sheet = document.getElementById('modal-sheet');

  const typeCheckboxes = sheet.querySelectorAll('#int-type-list input[type="checkbox"]:checked');
  const interventionTypes = Array.from(typeCheckboxes).map(cb => cb.value);

  if (interventionTypes.length === 0) {
    showToast('Sélectionne au moins un type d\'intervention.', 'error');
    return;
  }

  const partsListExists = !!sheet.querySelector('#int-parts-list');
  const partCheckboxes = sheet.querySelectorAll('.part-checkbox:checked');
  if (partsListExists && partCheckboxes.length === 0) {
    showToast('Sélectionne au moins une partie concernée.', 'error');
    return;
  }

  const parts = Array.from(partCheckboxes).map(cb => {
    const partName = cb.value;
    const budgetInput = sheet.querySelector(`.budget-input[data-part="${CSS.escape(partName)}"]`);
    const commentInput = sheet.querySelector(`.comment-input[data-part="${CSS.escape(partName)}"]`);
    const budget = budgetInput && budgetInput.value !== '' ? parseFloat(budgetInput.value) : 0;
    const comment = commentInput ? commentInput.value.slice(0, 200) : '';
    return { partName, budget, comment };
  });

  const generalComment = document.getElementById('int-general-comment').value;
  const totalBudget = parts.reduce((sum, p) => sum + (p.budget || 0), 0);

  let timestamp;
  const tsInput = document.getElementById('int-timestamp');
  timestamp = tsInput ? new Date(tsInput.value).toISOString() : new Date().toISOString();

  const data = { interventionTypes, parts, generalComment, totalBudget, timestamp };

  if (interventionId) {
    data.id = interventionId;
    const existing = await EvolveDB.dbGet(EvolveDB.STORES.INTERVENTIONS, interventionId);
    data.uuid = existing && existing.uuid ? existing.uuid : EvolveDB.generateUUID();
    data.deviceId = existing && existing.deviceId !== undefined ? existing.deviceId : await Devices.getCurrentId();
    await EvolveDB.dbPut(EvolveDB.STORES.INTERVENTIONS, data);
    showToast('Intervention modifiée', 'success');
  } else {
    data.uuid = EvolveDB.generateUUID();
    data.deviceId = await Devices.getCurrentId();
    await EvolveDB.dbAdd(EvolveDB.STORES.INTERVENTIONS, data);
    showToast('Intervention enregistrée', 'success');
  }

  closeModal();
  Maintenance.renderList();
};

// --- Détail intervention ---
Maintenance.openInterventionDetail = async function (interventionId) {
  const intervention = await EvolveDB.dbGet(EvolveDB.STORES.INTERVENTIONS, interventionId);

  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-header">
      <h2>Détail intervention</h2>
      <button class="modal-close" id="int-detail-close"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${Calc.formatDateTime(intervention.timestamp)}</span></div>
    <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${intervention.interventionTypes.join(', ')}</span></div>
    <div class="detail-row"><span class="detail-label">Budget total</span><span class="detail-value">${intervention.totalBudget.toFixed(2)} €</span></div>

    <div class="panel-title mt-16">Parties concernées</div>
    ${intervention.parts.map(p => `
      <div class="panel" style="padding:12px;margin-bottom:8px">
        <div class="flex-row" style="justify-content:space-between;margin-bottom:4px">
          <strong style="font-size:14.5px">${p.partName}</strong>
          <span style="font-family:var(--font-mono);color:var(--accent-green)">${(p.budget || 0).toFixed(2)} €</span>
        </div>
        ${p.comment ? `<div style="font-size:13px;color:var(--text-secondary)">${escapeHtml(p.comment)}</div>` : ''}
      </div>
    `).join('')}

    ${intervention.generalComment ? `
      <div class="panel-title mt-16">Commentaire général</div>
      <div class="panel" style="padding:12px;font-size:14px;color:var(--text-secondary)">${escapeHtml(intervention.generalComment)}</div>
    ` : ''}

    <div class="modal-actions">
      <button class="btn btn-secondary flex-1" id="int-detail-edit">Modifier</button>
    </div>
  `;
  document.getElementById('int-detail-close').onclick = closeModal;
  document.getElementById('int-detail-edit').onclick = () => Maintenance.openInterventionForm(interventionId);
  openModal();
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Rendu liste interventions ---
Maintenance.renderList = async function () {
  const deviceId = await Devices.getCurrentId();
  const interventions = (await EvolveDB.dbGetAll(EvolveDB.STORES.INTERVENTIONS)).filter(i => i.deviceId === deviceId);

  let result = Calc.searchInterventions(interventions, currentMaintenanceSearch);
  result = Calc.sortInterventions(result, currentMaintenanceSort.by, currentMaintenanceSort.order);

  const listContainer = document.getElementById('maintenance-list');
  if (result.length === 0) {
    listContainer.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a4 4 0 11-5.1 5.1L6.3 20.7a1.5 1.5 0 11-2.1-2.1L13.6 8.2a4 4 0 010-5.1 4 4 0 011.1-.8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
      <p>Aucune intervention enregistrée. Ajoute la première révision ou réparation.</p>
    </div>`;
    return;
  }

  listContainer.innerHTML = result.map(i => {
    const badgeClass = i.interventionTypes.includes('Remplacement') ? 'badge-remplacement' : i.interventionTypes.includes('Révision constructeur') ? 'badge-revision' : 'badge-entretien';
    const partsNames = i.parts.map(p => p.partName).join(', ');
    const comment = (i.generalComment || '').trim();
    const budgetHtml = i.totalBudget > 0 ? `<span class="item-card-budget">${i.totalBudget.toFixed(2)} €</span>` : '';
    return `
      <div class="item-card" data-intervention-id="${i.id}">
        <div class="item-card-top">
          <span class="item-card-date">${Calc.formatDate(i.timestamp)}</span>
          <span class="item-card-badge ${badgeClass}">${i.interventionTypes[0]}${i.interventionTypes.length > 1 ? ' +' + (i.interventionTypes.length - 1) : ''}</span>
        </div>
        <div class="item-card-main">${partsNames}</div>
        ${comment ? `<div class="item-card-comment">${escapeHtml(comment)}</div>` : ''}
        <div class="item-card-row">
          <span>${i.parts.length} partie${i.parts.length > 1 ? 's' : ''}</span>
          ${budgetHtml}
        </div>
      </div>
    `;
  }).join('');

  listContainer.querySelectorAll('.item-card').forEach(el => {
    el.onclick = () => Maintenance.openInterventionDetail(parseInt(el.dataset.interventionId));
  });
};

window.Maintenance = Maintenance;

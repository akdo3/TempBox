function renderSkeleton(count = 3) {
  return Array.from({ length: count }, (_, i) => `
    <div class="email-card skeleton-card" style="animation-delay: ${i * 100}ms">
      <div class="email-header">
        <div class="skeleton skeleton-text" style="width: 75%; height: 16px;"></div>
        <div class="skeleton" style="width: 24px; height: 18px; border-radius: 9px;"></div>
      </div>
      <div class="skeleton skeleton-text" style="width: 45%; height: 12px; margin-top: 8px;"></div>
      <div class="email-actions" style="border-top-color: transparent; margin-top: 14px;">
        <div class="skeleton" style="flex: 1; height: 32px; border-radius: 8px;"></div>
        <div class="skeleton" style="flex: 1; height: 32px; border-radius: 8px;"></div>
        <div class="skeleton" style="flex: 1; height: 32px; border-radius: 8px;"></div>
      </div>
    </div>
  `).join('');
}

function renderMessageSkeleton(count = 4) {
  return Array.from({ length: count }, (_, i) => `
    <div class="message-item skeleton-message" style="animation-delay: ${i * 80}ms">
      <div class="message-item-top">
        <div class="skeleton skeleton-text" style="width: 40%; height: 13px;"></div>
        <div class="skeleton skeleton-text" style="width: 55px; height: 11px;"></div>
      </div>
      <div class="skeleton skeleton-text" style="width: 85%; height: 13px; margin: 4px 0 3px;"></div>
      <div class="skeleton skeleton-text" style="width: 95%; height: 12px;"></div>
    </div>
  `).join('');
}

function renderDetailSkeleton() {
  return `
    <div class="message-view-wrapper view-enter">
      <div class="message-view-header">
        <button class="message-view-back" id="msgDetailBack">&#8592; Back</button>
        <div class="skeleton skeleton-text" style="width: 65%; height: 16px; display: inline-block; vertical-align: middle;"></div>
      </div>
      <div class="message-detail-meta-bar">
        <div class="skeleton skeleton-text" style="width: 55%; height: 12px; margin-bottom: 4px;"></div>
        <div class="skeleton skeleton-text" style="width: 40%; height: 12px;"></div>
      </div>
      <div class="message-detail-frame-wrap">
        <div class="skeleton" style="width: 100%; height: 100%; border-radius: 10px;"></div>
      </div>
    </div>
  `;
}

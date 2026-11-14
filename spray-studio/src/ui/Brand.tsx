/**
 * Brand marks: the EVADE logo (where the old app's wordmark sat) and the
 * small "Activated by MEDIALIFE" sign-off, both served by the main site.
 */
import React from 'react';

export const EVADE_LOGO = '/brand/evade-logo.webp';
export const ACTIVATED_BY = '/activated-merch/media/ar/activated-by.webp';

export const EvadeLogo: React.FC<{ className?: string }> = ({ className = 'h-6 w-auto' }) => (
  <img src={EVADE_LOGO} alt="EVADE" width={600} height={158} draggable={false} className={className} />
);

export const ActivatedBy: React.FC<{ className?: string }> = ({ className = 'h-8 w-auto' }) => (
  <img
    src={ACTIVATED_BY}
    alt="Activated by MEDIALIFE"
    width={360}
    height={142}
    draggable={false}
    className={className}
  />
);

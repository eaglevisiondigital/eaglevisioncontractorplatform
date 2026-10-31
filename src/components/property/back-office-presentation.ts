import { createContext } from 'react';

/** Presentation only; never an authorization or feature-activation signal. */
export const BackOfficeConcept = createContext(false);

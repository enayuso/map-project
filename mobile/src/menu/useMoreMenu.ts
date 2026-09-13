/**
 * Open/closed state for the "More" menu itself — see MoreMenu.tsx's own
 * header comment for what this is. The actual `items` list stays in
 * App.tsx (not here): it's an array of every other feature's own toggle
 * function, so building it genuinely belongs where all those other
 * features live, not inside this hook.
 */
import { useState } from 'react';

export type UseMoreMenu = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
};

export function useMoreMenu(closeUtilityPanels: () => void): UseMoreMenu {
  const [visible, setVisible] = useState(false);

  const toggle = () => {
    if (visible) {
      setVisible(false);
    } else {
      closeUtilityPanels();
      setVisible(true);
    }
  };

  return { visible, toggle, close: () => setVisible(false) };
}

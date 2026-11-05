import { useCallback, useRef, useState } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  description: string;
}

/**
 * Accessible hover/focus tooltip (Section 11.3).
 * - Trigger is focusable and announces the description via aria-label.
 * - Tooltip popup is role="tooltip", shown on hover/focus, hidden on blur/leave.
 * - No color-only signal: the trigger also uses an underline.
 */
export function Tooltip({ children, description }: TooltipProps) {
  const [visible, setVisible] = useState<boolean>(false);
  const tipId = useRef<string>(`swarmway-tooltip-${Math.random().toString(36).slice(2)}`);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-block relative cursor-help"
    >
      <span
        id={tipId.current}
        aria-label={description}
        className="border-b border-[#D4CFC5]/60 dotted underline-offset-2"
      >
        {children}
      </span>
      {visible && (
        <span
          id={`${tipId.current}-body`}
          role="tooltip"
          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[#171614] bg-[#FAF9F6] border border-[#D4CFC5] rounded shadow-sm whitespace-nowrap"
        >
          {description}
        </span>
      )}
    </span>
  );
}

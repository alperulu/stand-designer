import type { ReactNode } from 'react';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { ToolPanel } from './ToolPanel';
import { Toolbar } from './Toolbar';
import { useShortcuts } from './useShortcuts';

export function EditorShell({
  viewport,
  onExport,
  exporting,
}: {
  viewport: ReactNode;
  onExport: () => void;
  exporting: boolean;
}) {
  useShortcuts();
  return (
    <div className="shell">
      <Toolbar onExport={onExport} exporting={exporting} />
      <ToolPanel />
      <main className="viewport">{viewport}</main>
      <PropertiesPanel />
      <StatusBar />
    </div>
  );
}

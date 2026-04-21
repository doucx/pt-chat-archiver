import { useMemo } from 'preact/hooks';
import { generateStatisticsText } from '../../analysis.js';
import { currentMessages } from '../store/dataStore';
import { selectedChannel } from '../store/uiStore';

export function StatsView() {
  const msgs = currentMessages.value;
  const channel = selectedChannel.value;

  const statsText = useMemo(() => {
    return generateStatisticsText(msgs, channel);
  }, [msgs, channel]);

  return (
    <div
      id="log-archive-stats-view"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}
    >
      <textarea
        readOnly
        className="log-archive-ui-log-display"
        style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
        value={statsText}
      />
    </div>
  );
}

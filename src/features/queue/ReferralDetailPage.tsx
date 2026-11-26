import { ReferralsWorkspace } from './ReferralsWorkspace';
import { useParams } from 'react-router-dom';
import { ReferralDetailView } from './ReferralDetailView';

/**
 * /referrals/:id. Renders the same workspace as /referrals, so the list stays mounted and the referral opens in the drawer.
 * The id in the URL is opaque: no patient data.
 */
export function ReferralDetailPage() {
  return <ReferralsWorkspace />;
}

/** /referrals/:id/full. The whole referral record at full width: header, then the two-column body on desktop. */
export function ReferralFullPage() {
  const { id } = useParams();
  return <ReferralDetailView id={id ?? ''} backTo="/referrals" variant="page" />;
}

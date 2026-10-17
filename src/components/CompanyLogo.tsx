import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CompanyProfile } from '../domain/platform';
export function CompanyLogo({
  company,
  sample,
}: {
  company?: CompanyProfile;
  sample: boolean;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (sample || !company?.logo_document_id || !supabase) return;
    const client = supabase;
    let active = true;
    let objectUrl = '';
    void (async () => {
      const { data, error } = await client
        .from('documents')
        .select('object_name')
        .eq('organization_id', company.id)
        .eq('id', company.logo_document_id!)
        .eq('scan_status', 'clean')
        .single();
      if (error || !data) return;
      const file = await client.storage
        .from('company-documents')
        .download(data.object_name);
      if (
        file.error ||
        !file.data ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.data.type)
      )
        return;
      objectUrl = URL.createObjectURL(file.data);
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [company, sample]);
  return url ? (
    <img
      className="private-company-logo"
      src={url}
      alt={`${company?.name} logo`}
    />
  ) : null;
}

import { productConfig } from '../config/product';
import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — ${productConfig.productName}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

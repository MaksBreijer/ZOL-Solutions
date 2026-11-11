update public.discounts
set title = '20% bundelkorting bij 2 paar',
    value = 20,
    updated_at = now()
where method = 'automatic'
  and title = '10% bundelkorting bij 2 paar';

delete from auth.sessions
where user_id = '5843f4dd-9484-4968-ba7d-5ec190abea3f'::uuid;

delete from auth.mfa_factors
where id = '3b944937-4f43-44d8-aad7-ed79a3cffedc'::uuid
  and user_id = '5843f4dd-9484-4968-ba7d-5ec190abea3f'::uuid;

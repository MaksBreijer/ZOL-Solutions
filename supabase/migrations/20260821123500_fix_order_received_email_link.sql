update public.email_templates
set button_label_template = 'Naar ZOL Solutions',
    button_url_template = '{{website_url}}'
where template_key = 'order_received'
  and button_url_template = '{{website_url}}/checkout/?ref={{order_id}}';

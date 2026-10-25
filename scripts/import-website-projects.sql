-- Idempotent public-source project import. Existing edits, assignments and activity stay intact.
-- Verified against https://www.globalshapers.si/sl/ and /subvencije/ on 25 October 2026.
with source_projects(name,description,status,import_key) as (values
 ('Shapers Academy','Brezplačen karierni pospeševalnik za mlade s plačanimi priložnostmi pri partnerskih podjetjih. Vir: https://www.globalshapers.si/sl/','active','globalshapers.si/sl/shapers-academy'),
 ('Poletna šola Pot do uspeha','Brezplačna petdnevna podjetniška šola za razvoj in predstavitev ideje. Vir: https://www.globalshapers.si/sl/','active','globalshapers.si/sl/poletna-sola-pot-do-uspeha'),
 ('Shape Talks','Moderirane debate o vprašanjih, pomembnih mladim, v Impact Hubu Ljubljana. Vir: https://www.globalshapers.si/sl/','active','globalshapers.si/sl/shape-talks'),
 ('Predavanja in delavnice','Predavanja in delavnice s strokovnjaki ter pogovori po dogodku. Vir: https://www.globalshapers.si/sl/','active','globalshapers.si/sl/predavanja-in-delavnice'),
 ('Obiski šol','Interaktivne delavnice Od koncepta do produkta na srednjih šolah. Vir: https://www.globalshapers.si/sl/','active','globalshapers.si/sl/obiski-sol'),
 ('Mreža mentorjev','Mreža za dostop članov do izkušenih strokovnjakov; na strani označena Kmalu. Vir: https://www.globalshapers.si/sl/','planning','globalshapers.si/sl/mreza-mentorjev'),
 ('Programska oprema za NVO','Katalog popustov, brezplačnih paketov in programskih ugodnosti za nevladne organizacije. Vir: https://www.globalshapers.si/subvencije/','active','globalshapers.si/subvencije')
)
insert into public.org_projects(name,description,status,import_key)
select s.* from source_projects s
where not exists (select 1 from public.org_projects p where p.import_key=s.import_key or lower(btrim(p.name))=lower(s.name))
on conflict (import_key) do nothing;

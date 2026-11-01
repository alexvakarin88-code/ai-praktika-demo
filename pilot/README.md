# AI Практика — закрытый пилот помощника логиста

## Архитектура
- Интерфейс: GitHub Pages (публичная страница входа).
- База и авторизация: Supabase.
- Данные доступны только авторизованным участникам workspace по правилам RLS.
- Исходный код находится в публичном репозитории; не храните в нём пароли, service_role keys или рабочие данные.

## Настройка Supabase
1. Создайте проект на https://supabase.com/dashboard (для теста можно начать с Free).
2. Откройте SQL Editor и выполните весь файл `schema.sql`.
3. Authentication → Users → Add user: создайте собственную учётную запись, скопируйте её UUID.
4. В SQL Editor выполните: `insert into public.workspaces(name) values('AI Практика — пилот логистики') returning id;`
5. Скопируйте UUID пространства и выполните, подставив свои UUID:
   `insert into public.workspace_members(workspace_id,user_id,role) values('WORKSPACE_UUID','OWNER_AUTH_UUID','owner');`
6. Создайте пользователя логиста в Authentication → Users → Add user, скопируйте UUID и добавьте:
   `insert into public.workspace_members(workspace_id,user_id,role) values('WORKSPACE_UUID','TESTER_AUTH_UUID','tester');`
7. Project Settings → API: скопируйте Project URL и anon/public key. Не используйте service_role key.
8. В GitHub откройте `pilot/config.js` и замените три значения: URL, anon/public key, workspace UUID. Коммитните изменение.

## Публикация
Репозиторий уже использует GitHub Pages для основного сайта. После включения Pages для ветки main путь пилота должен быть:
https://alexvakarin88-code.github.io/ai-praktika-demo/pilot/

Если Pages ещё не активирован: Repository → Settings → Pages → Deploy from a branch → main → /(root) → Save.

## Создание учётных записей
Регистрации в приложении нет. Аккаунты создаются владельцем через Supabase Authentication → Users. После создания каждого аккаунта добавьте его UUID в workspace_members с ролью owner или tester.

## Ограничения пилота
- Используйте только искусственные или обезличенные данные до согласования с руководством/ИТ компании.
- Файлы читаются в браузере; в базе хранится содержимое первой таблицы в JSONB.
- Нет интеграции с iiko, автоматического расчёта закупки или отправки заявок поставщикам.
- После добавления данных второй участник видит их после обновления страницы.
- Публично доступна страница входа и исходный код, но данные защищены Supabase Auth и RLS при правильной настройке политик.
- Бесплатный тариф не гарантирует постоянную доступность; перед пилотом ознакомьтесь с актуальными лимитами Supabase.
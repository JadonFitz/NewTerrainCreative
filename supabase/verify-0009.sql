-- Run after 0009. Expect no Brand Builder campaign under '(unclassified)'.
select funnel, campaign, count(*) as rows, sum(spend) as spend
  from public.campaign_daily_metrics
 where platform = 'meta'
   and campaign ilike '%brand%'
 group by funnel, campaign
 order by funnel, campaign;

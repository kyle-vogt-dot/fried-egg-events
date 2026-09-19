update tournaments
set scoring_type = 'match_play'
where event_kind = 'league'
  and (scoring_type is null or btrim(scoring_type) = '');

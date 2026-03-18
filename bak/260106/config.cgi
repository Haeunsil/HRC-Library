#!/usr/bin/perl -w

use CGI;
use Cwd;
use DBI;
use JSON;

$q = new CGI;

$action = $q->param('action');

# MSSQL 연결 정보 (다양한 설정 시도)
my $dsn = "DBI:ODBC:Driver={ODBC Driver 17 for SQL Server};Server=10.0.11.175,15000;Database=WEBDEMO;Trusted_Connection=no;Encrypt=no;TrustServerCertificate=yes;";
my $username = "esha";
my $password = "ws5000997!";

# 에러 처리 추가
eval {
    $dbh = DBI->connect($dsn, $username, $password, {
        RaiseError => 0,
        AutoCommit => 1,
        odbc_utf8_on => 1,
        LongReadLen => 1048576,  # 1MB로 설정 (nvarchar(max) 처리)
        LongTruncOk => 1          # 긴 데이터 잘림 허용
    });
    
    if (!$dbh) {
        die "DB 연결 실패: " . DBI->errstr;
    }
};

if ($@) {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    print encode_json({
        error => "DB 연결 오류: " . $@
    });
    exit;
}

if ($action eq "get_data") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # 실제 데이터 조회 (nvarchar(max) 처리 개선)
        $query = "SELECT QuestionQnum, CAST(QuestionSourceQM AS NVARCHAR(MAX)) AS QuestionSourceQM, CAST(PerlSourceQ AS NVARCHAR(MAX)) AS PerlSourceQ, CAST(PerlSourceC  AS NVARCHAR(MAX)) AS PerlSourceC , QuestionTag FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @data;
        while (my $row = $sth->fetchrow_hashref()) {
            # DB의 int형 QuestionQnum(1,2,3...)을 q1,q2,q3... 형태로 변환
            my $qnum = "q" . $row->{QuestionQnum};
            
            # nvarchar(max) 데이터 처리 개선
            my $qmcode = $row->{QuestionSourceQM};
            my $perlcodeQ = $row->{PerlSourceQ};
            my $perlcodeC = $row->{PerlSourceC};
            
            # 데이터가 정의되지 않았거나 빈 값인 경우 처리
            if (!defined($qmcode) || $qmcode eq "" || $qmcode eq "NULL") {
                $qmcode = "";  # 공백으로 설정
            } else {
                # 문자열 정리 (앞뒤 공백 제거)
                $qmcode =~ s/^\s+|\s+$//g;
            }
            
            if (!defined($perlcodeQ) || $perlcodeQ eq "" || $perlcodeQ eq "NULL") {
                $perlcodeQ = "";  # 공백으로 설정
            } else {
                # 문자열 정리 (앞뒤 공백 제거)
                $perlcodeQ =~ s/^\s+|\s+$//g;
            }
            
            if (!defined($perlcodeC) || $perlcodeC eq "" || $perlcodeC eq "NULL") {
                $perlcodeC = "";  # 공백으로 설정
            } else {
                # 문자열 정리 (앞뒤 공백 제거)
                $perlcodeC =~ s/^\s+|\s+$//g;
            }
            
            push @data, {
                qnum => $qnum,
                qmcode => $qmcode,
                perlcodeQ => $perlcodeQ,
                perlcodeC => $perlcodeC,
                questionTag => $row->{QuestionTag} || $qnum
            };
        }
        
        # 프론트엔드가 기대하는 배열 형태로 반환
        print encode_json(\@data);
    };
    
    if ($@) {
        print encode_json({
            error => "데이터 조회 오류: " . $@
        });
    }
} elsif ($action eq "get_qnums") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # QuestionQnum을 q1, q2... 형태로 변환하여 Qnum 목록 조회
        $query = "SELECT DISTINCT QuestionQnum FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @qnums;
        my @debug_info;
        while (my $row = $sth->fetchrow_hashref()) {
            # DB의 int형 QuestionQnum(1,2,3...)을 q1,q2,q3... 형태로 변환
            my $qnum = "q" . $row->{QuestionQnum};
            push @qnums, $qnum;
            push @debug_info, {
                original => $row->{QuestionQnum},
                converted => $qnum
            };
        }
        
        # 기존 프론트엔드 호환성을 위해 배열만 반환
        print encode_json(\@qnums);
    };
    
    if ($@) {
        print encode_json({
            error => "Qnum 조회 오류: " . $@
        });
    }
} elsif ($action eq "debug_columns") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # 테이블 구조만 확인
        $query = "SELECT TOP 1 * FROM [WEBDEMO].[dbo].[LibraryList]";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my $row = $sth->fetchrow_hashref();
        if ($row) {
            print encode_json({
                available_columns => [keys %$row],
                sample_data => $row,
                message => "테이블 구조 확인 완료"
            });
        } else {
            print encode_json({
                error => "테이블에 데이터가 없습니다"
            });
        }
    };
    
    if ($@) {
        print encode_json({
            error => "디버깅 오류: " . $@
        });
    }
} elsif ($action eq "debug_qnums") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # QuestionQnum 값들을 확인
        $query = "SELECT QuestionQnum, COUNT(*) as count FROM [WEBDEMO].[dbo].[LibraryList] GROUP BY QuestionQnum ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @qnums;
        while (my $row = $sth->fetchrow_hashref()) {
            push @qnums, {
                qnum => $row->{QuestionQnum},
                count => $row->{count}
            };
        }
        
        print encode_json({
            qnums => \@qnums,
            message => "QuestionQnum 값들 확인 완료"
        });
    };
    
    if ($@) {
        print encode_json({
            error => "디버깅 오류: " . $@
        });
    }
} elsif ($action eq "debug_q1") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # QuestionQnum=1인 데이터만 확인
        $query = "SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum = 1";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my $row = $sth->fetchrow_hashref();
        if ($row) {
            print encode_json({
                found_q1 => true,
                data => $row,
                message => "QuestionQnum=1 데이터 발견"
            });
        } else {
            print encode_json({
                found_q1 => false,
                message => "QuestionQnum=1 데이터가 없습니다"
            });
        }
    };
    
    if ($@) {
        print encode_json({
            error => "디버깅 오류: " . $@
        });
    }
} elsif ($action eq "debug_qnums_detailed") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # QuestionQnum 값들을 상세히 확인
        $query = "SELECT DISTINCT QuestionQnum FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @debug_info;
        while (my $row = $sth->fetchrow_hashref()) {
            my $qnum = "q" . $row->{QuestionQnum};
            push @debug_info, {
                original => $row->{QuestionQnum},
                converted => $qnum
            };
        }
        
        print encode_json({
            debug_info => \@debug_info,
            count => scalar(@debug_info),
            message => "QuestionQnum 상세 정보"
        });
    };
    
    if ($@) {
        print encode_json({
            error => "디버깅 오류: " . $@
        });
    }
} elsif ($action eq "get_question_types") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # QuestionType 값들을 조회
        $query = "SELECT DISTINCT QuestionType FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionType IS NOT NULL AND QuestionType != '' ORDER BY QuestionType";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @question_types;
        while (my $row = $sth->fetchrow_hashref()) {
            push @question_types, $row->{QuestionType};
        }
        
        print encode_json(\@question_types);
    };
    
    if ($@) {
        print encode_json({
            error => "QuestionType 조회 오류: " . $@
        });
    }
} elsif ($action eq "get_qnums_by_type") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        my $question_type = $q->param('type');
        
        if (!$question_type) {
            die "QuestionType 파라미터가 필요합니다";
        }
        
        # 특정 QuestionType에 해당하는 qnum과 QuestionTag를 조회
        $query = "SELECT QuestionQnum, QuestionTag FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionType = ? AND QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute($question_type);
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @qnums_with_tags;
        while (my $row = $sth->fetchrow_hashref()) {
            my $qnum = "q" . $row->{QuestionQnum};
            my $tag = $row->{QuestionTag} || $qnum; # QuestionTag가 없으면 qnum 사용
            
            push @qnums_with_tags, {
                value => $qnum,
                text => $tag
            };
        }
        
        print encode_json(\@qnums_with_tags);
    };
    
    if ($@) {
        print encode_json({
            error => "QuestionType별 Qnum 조회 오류: " . $@
        });
    }
} elsif ($action eq "search_questions") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        my $search_term = $q->param('q');
        
        if (!$search_term) {
            print encode_json([]);
            exit;
        }
        
        # QuestionTag에서 검색어를 포함하는 항목들을 조회
        $query = "SELECT QuestionQnum, QuestionTag, QuestionType FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionTag LIKE ? AND QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute("%$search_term%");
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @search_results;
        while (my $row = $sth->fetchrow_hashref()) {
            my $qnum = "q" . $row->{QuestionQnum};
            push @search_results, {
                qnum => $qnum,
                questionTag => $row->{QuestionTag} || $qnum,
                questionType => $row->{QuestionType} || "unknown"
            };
        }
        
        print encode_json(\@search_results);
    };
    
    if ($@) {
        print encode_json({
            error => "검색 오류: " . $@
        });
    }
} elsif ($action eq "debug_all_data") {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    
    eval {
        # 모든 데이터를 확인 (QuestionQnum 순서대로)
        $query = "SELECT QuestionQnum, QuestionSourceQM, PerlSourceQ, PerlSourceC FROM [WEBDEMO].[dbo].[LibraryList] WHERE QuestionQnum IS NOT NULL ORDER BY QuestionQnum";
        $sth = $dbh->prepare($query);
        
        if (!$sth) {
            die "쿼리 준비 실패: " . $dbh->errstr;
        }
        
        $sth->execute();
        
        if ($sth->err) {
            die "쿼리 실행 실패: " . $sth->errstr;
        }
        
        my @all_data;
        while (my $row = $sth->fetchrow_hashref()) {
            my $qnum = "q" . $row->{QuestionQnum};
            push @all_data, {
                original_qnum => $row->{QuestionQnum},
                converted_qnum => $qnum,
                has_qmcode => defined($row->{QuestionSourceQM}) && $row->{QuestionSourceQM} ne "",
                has_perlcode => defined($row->{QuestionSourcePERL}) && $row->{QuestionSourcePERL} ne ""
            };
        }
        
        print encode_json({
            all_data => \@all_data,
            message => "모든 데이터 확인 완료"
        });
    };
    
    if ($@) {
        print encode_json({
            error => "디버깅 오류: " . $@
        });
    }
} else {
    print $q->header(-type=>'application/json', -charset=>'utf-8');
    print encode_json({
        error => "Invalid action: " . ($action || "no action specified"),
        available_actions => ["get_data", "get_qnums", "get_question_types", "get_qnums_by_type", "debug_columns", "debug_qnums", "debug_q1", "debug_qnums_detailed", "debug_all_data"]
    });
}

$dbh->disconnect;

